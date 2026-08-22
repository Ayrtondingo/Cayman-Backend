import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { UsersService } from '../users/users.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { Currency } from '../common/enums/currency.enum';

/** La caja en pesos es la cuenta principal del cliente. */
const primaryOf = (accounts?: Account[]) =>
  accounts?.find((account) => account.currency === Currency.ARS) ?? null;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async getAllUsers() {
    const users = await this.userRepository.find({ relations: ['accounts'] });
    return users.map((u) => {
      const primary = primaryOf(u.accounts);
      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        dni: u.dni,
        role: u.role,
        balance: primary?.balance ?? 0,
        cbu: primary?.cbu ?? null,
        // Alias de `cbu`. Se mantiene mientras el frontend siga leyendo este campo.
        accountNumber: primary?.cbu ?? null,
        alias: primary?.alias ?? null,
        accounts: (u.accounts ?? []).map((account) => ({
          cbu: account.cbu,
          alias: account.alias,
          currency: account.currency,
          balance: Number(account.balance),
        })),
      };
    });
  }

  /**
   * Ajuste manual de saldo. Solo el gerente.
   *
   * Deja un movimiento en la cuenta con quien lo hizo: un banco no puede tener
   * plata que aparece sin rastro. Las dos cosas van en una transaccion de base,
   * para que no quede saldo cambiado sin el movimiento que lo explica.
   */
  async adjustBalance(
    requesterId: string,
    targetUserId: string,
    amount: number,
    currency: Currency = Currency.ARS,
    motivo?: string,
  ) {
    if (!Number.isFinite(amount) || amount === 0) {
      throw new BadRequestException('El importe del ajuste no puede ser cero');
    }

    const requester = await this.userRepository.findOne({ where: { id: requesterId } });
    if (!requester || requester.role !== UserRole.GERENTE) {
      throw new ForbiddenException('Solo el gerente puede ajustar saldos');
    }

    const account = await this.accountRepository.findOne({
      where: { user: { id: targetUserId }, currency },
      relations: ['user'],
    });
    if (!account) throw new NotFoundException('Usuario o cuenta no encontrada');

    const saldoPrevio = Number(account.balance);

    if (saldoPrevio + amount < 0) {
      throw new BadRequestException(
        `El ajuste dejaria la cuenta en negativo (saldo actual ${saldoPrevio})`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      account.balance = Math.round((saldoPrevio + amount) * 100) / 100;
      await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount,
          type: amount > 0 ? TransactionType.DEPOSIT : TransactionType.WITHDRAWAL,
          category: TransactionCategory.OTROS,
          description:
            `Ajuste manual de ${requester.fullName}` + (motivo ? `: ${motivo}` : ''),
          status: TransactionStatus.LOCAL,
          account,
        }),
      );
    });

    return {
      cliente: account.user?.fullName,
      moneda: account.currency,
      saldoPrevio,
      ajuste: amount,
      balance: Number(account.balance),
    };
  }

  async changeRole(
    requesterId: string,
    targetUserId: string,
    newRole: UserRole,
  ) {
    const requester = await this.userRepository.findOne({
      where: { id: requesterId },
    });
    if (!requester || requester.role !== UserRole.GERENTE) {
      throw new ForbiddenException('Solo el gerente puede cambiar roles');
    }

    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    target.role = newRole;
    await this.userRepository.save(target);
    return { id: target.id, role: target.role };
  }

  async grantClientAccess(targetUserId: string, data: CreatePersonDto) {
    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    return this.usersService.syncWithCentralBank(targetUserId, data);
  }
}
