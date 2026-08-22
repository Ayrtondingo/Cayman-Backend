import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Topup, TopupStatus } from './entities/topup.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Currency } from '../common/enums/currency.enum';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Operadoras aceptadas. Mock: no hay una API real de las telcos para el curso. */
const OPERADORAS = ['movistar', 'personal', 'claro', 'tuenti'];

const MONTO_MINIMO = Number(process.env.TOPUP_MIN ?? 100);
const MONTO_MAXIMO = Number(process.env.TOPUP_MAX ?? 50000);

/** Celular argentino sin 0 ni 15: codigo de area + numero, 10 digitos. */
const NUMERO_REGEX = /^\d{10}$/;

@Injectable()
export class TopupsService {
  constructor(
    @InjectRepository(Topup)
    private readonly topupRepository: Repository<Topup>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  listOperadoras() {
    return OPERADORAS.map((operadora) => ({
      id: operadora,
      nombre: operadora.charAt(0).toUpperCase() + operadora.slice(1),
    }));
  }

  /**
   * Recarga saldo prepago debitando de la caja en pesos.
   *
   * La aprobacion es determinista (operadora valida, numero bien formado, monto
   * en rango y saldo suficiente) y no aleatoria: un rechazo al azar seria
   * imposible de probar y de explicarle al cliente.
   *
   * Igual que en tarjetas, un rechazo se persiste en vez de tirar error, asi
   * queda registro de por que no se pudo recargar.
   */
  async recharge(
    clerkId: string,
    data: { operadora: string; numero: string; monto: number },
  ) {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const operadora = String(data.operadora ?? '').toLowerCase();
    const numero = String(data.numero ?? '').replace(/\D/g, '');
    const monto = Number(data.monto);

    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    const reject = (motivo: string) =>
      this.topupRepository
        .save(
          this.topupRepository.create({
            operadora,
            numero,
            amount: monto,
            status: TopupStatus.RECHAZADA,
            motivo,
            user,
          }),
        )
        .then((topup) => ({ id: topup.id, estado: topup.status, motivo }));

    if (!OPERADORAS.includes(operadora)) {
      return reject(
        `Operadora no soportada. Validas: ${OPERADORAS.join(', ')}`,
      );
    }

    if (!NUMERO_REGEX.test(numero)) {
      return reject('Numero invalido: se esperan 10 digitos sin 0 ni 15');
    }

    if (monto < MONTO_MINIMO || monto > MONTO_MAXIMO) {
      return reject(
        `El monto debe estar entre ${MONTO_MINIMO} y ${MONTO_MAXIMO}`,
      );
    }

    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency: Currency.ARS },
    });

    if (!account) {
      return reject('No tenes caja de ahorro en pesos');
    }

    if (Number(account.balance) < monto) {
      return reject('Saldo insuficiente');
    }

    const topup = await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) - monto);
      await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount: -monto,
          type: TransactionType.WITHDRAWAL,
          description: `Recarga ${operadora} ${numero}`,
          category: TransactionCategory.RECARGA,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      return manager.save(
        manager.create(Topup, {
          operadora,
          numero,
          amount: monto,
          status: TopupStatus.APROBADA,
          motivo: null,
          user,
        }),
      );
    });

    return {
      id: topup.id,
      estado: topup.status,
      motivo: null,
      operadora,
      numero,
      monto: round2(monto),
      saldoCuenta: Number(account.balance),
    };
  }

  async findAllByUser(clerkId: string) {
    const topups = await this.topupRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    return topups.map((topup) => ({
      id: topup.id,
      fecha: topup.createdAt,
      operadora: topup.operadora,
      numero: topup.numero,
      monto: Number(topup.amount),
      estado: topup.status,
      motivo: topup.motivo,
    }));
  }
}
