import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { Card, CardStatus, CardType } from './entities/card.entity';
import {
  AuthorizationStatus,
  CardAuthorization,
} from './entities/card-authorization.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import {
  generateCardNumber,
  expirationDate,
  maskCardNumber,
} from './card-number';

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * TNA de referencia para tarjetas de credito.
 *
 * Lo correcto seria tomarla del Regimen de Transparencia del BCRA
 * (https://api.bcra.gob.ar/estadisticas/v1.0/Transparencia), pero hasta que
 * esa integracion exista queda configurable por env.
 */
const TNA_CREDITO = Number(process.env.CARD_TNA ?? 0.85);

/** Porcentaje del total del resumen que el cliente debe pagar como minimo. */
const PAGO_MINIMO_PCT = Number(process.env.CARD_PAGO_MINIMO_PCT ?? 0.1);

/** Dia del mes siguiente en que vence el resumen. */
const DIA_VENCIMIENTO = Number(process.env.CARD_DIA_VENCIMIENTO ?? 10);

@Injectable()
export class CardsService {
  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,
    @InjectRepository(CardAuthorization)
    private readonly authorizationRepository: Repository<CardAuthorization>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------------- Emision

  async issue(
    clerkId: string,
    data: { tipo: string; cbuAsociado?: string; limite?: number },
  ) {
    const tipo = String(data.tipo ?? '').toLowerCase() as CardType;

    if (!Object.values(CardType).includes(tipo)) {
      throw new BadRequestException(
        `Tipo de tarjeta invalido. Valores validos: ${Object.values(CardType).join(', ')}`,
      );
    }

    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (tipo === CardType.DEBITO) {
      if (!data.cbuAsociado) {
        throw new BadRequestException(
          'Una tarjeta de debito necesita un cbuAsociado',
        );
      }

      // La caja tiene que ser del mismo cliente: si no, la tarjeta descontaria
      // de una cuenta ajena en cada consumo.
      const account = await this.accountRepository.findOne({
        where: { cbu: data.cbuAsociado, user: { id: clerkId } },
      });

      if (!account) {
        throw new NotFoundException(
          'La cuenta asociada no existe o no es del cliente',
        );
      }
    }

    if (
      tipo === CardType.CREDITO &&
      (!data.limite || Number(data.limite) <= 0)
    ) {
      throw new BadRequestException(
        'Una tarjeta de credito necesita un limite mayor a cero',
      );
    }

    const card = await this.cardRepository.save(
      this.cardRepository.create({
        type: tipo,
        number: generateCardNumber(),
        cbuAsociado: tipo === CardType.DEBITO ? data.cbuAsociado : null,
        limite: tipo === CardType.CREDITO ? Number(data.limite) : null,
        status: CardStatus.ACTIVA,
        expiresAt: expirationDate(),
        user,
      }),
    );

    return this.toPublicCard(card);
  }

  // --------------------------------------------------------------- Lectura

  async findAllByUser(clerkId: string) {
    const cards = await this.cardRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(cards.map((card) => this.toPublicCard(card)));
  }

  async findAllByDni(dni: string) {
    const user = await this.userRepository.findOne({ where: { dni } });
    if (!user) throw new NotFoundException('No hay ningun cliente con ese DNI');
    return this.findAllByUser(user.id);
  }

  /** Busca una tarjeta verificando que sea del cliente autenticado. */
  private async ownedCard(clerkId: string, cardId: number): Promise<Card> {
    const card = await this.cardRepository.findOne({
      where: { id: cardId, user: { id: clerkId } },
      relations: ['user'],
    });

    if (!card) {
      throw new NotFoundException(
        'Tarjeta no encontrada o no pertenece al cliente',
      );
    }

    return card;
  }

  // ---------------------------------------------------------- Autorizacion

  /**
   * Autoriza un consumo en tiempo real.
   *
   * En debito valida saldo y descuenta de la caja asociada; en credito valida
   * limite disponible y solo registra el consumo (se cobra con el resumen).
   *
   * Un rechazo NO es un error HTTP: se persiste como autorizacion rechazada,
   * que es lo que despues explica al cliente por que no le paso la compra.
   */
  async authorize(
    clerkId: string,
    cardId: number,
    data: { comercio: string; monto: number; cuotas?: number },
  ) {
    const card = await this.ownedCard(clerkId, cardId);
    const monto = Number(data.monto);
    const cuotas = Number(data.cuotas ?? 1);

    if (!data.comercio) {
      throw new BadRequestException('Falta el comercio');
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    if (!Number.isInteger(cuotas) || cuotas < 1) {
      throw new BadRequestException(
        'Las cuotas deben ser un entero mayor o igual a 1',
      );
    }

    const reject = (motivo: string) =>
      this.authorizationRepository
        .save(
          this.authorizationRepository.create({
            comercio: data.comercio,
            amount: monto,
            cuotas,
            status: AuthorizationStatus.RECHAZADA,
            motivo,
            card,
          }),
        )
        .then((authorization) => ({
          id: authorization.id,
          estado: authorization.status,
          motivo,
        }));

    if (card.status === CardStatus.BLOQUEADA) {
      return reject('Tarjeta bloqueada');
    }

    if (new Date(card.expiresAt) < new Date()) {
      return reject('Tarjeta vencida');
    }

    if (card.type === CardType.DEBITO) {
      const account = await this.accountRepository.findOne({
        where: { cbu: card.cbuAsociado },
      });

      if (!account) {
        return reject('La cuenta asociada ya no existe');
      }

      if (Number(account.balance) < monto) {
        return reject('Saldo insuficiente');
      }

      // El descuento del saldo y el registro del consumo van juntos: si falla
      // uno, no queda plata descontada sin movimiento que la explique.
      const authorization = await this.dataSource.transaction(
        async (manager) => {
          account.balance = round2(Number(account.balance) - monto);
          await manager.save(Account, account);

          await manager.save(
            manager.create(Transaction, {
              amount: -monto,
              type: TransactionType.WITHDRAWAL,
              description: `Compra con debito en ${data.comercio}`,
              category: TransactionCategory.TARJETA,
              status: TransactionStatus.LOCAL,
              account,
            }),
          );

          return manager.save(
            manager.create(CardAuthorization, {
              comercio: data.comercio,
              amount: monto,
              cuotas,
              status: AuthorizationStatus.APROBADA,
              motivo: null,
              card,
            }),
          );
        },
      );

      return {
        id: authorization.id,
        estado: authorization.status,
        motivo: null,
        saldoRestante: Number(account.balance),
      };
    }

    // Credito: el tope es el limite menos lo ya consumido y no rechazado.
    const consumido = await this.consumedAmount(card.id);
    const disponible = round2(Number(card.limite) - consumido);

    if (monto > disponible) {
      return reject(`Limite insuficiente. Disponible: ${disponible}`);
    }

    const authorization = await this.authorizationRepository.save(
      this.authorizationRepository.create({
        comercio: data.comercio,
        amount: monto,
        cuotas,
        status: AuthorizationStatus.APROBADA,
        motivo: null,
        card,
      }),
    );

    return {
      id: authorization.id,
      estado: authorization.status,
      motivo: null,
      limiteDisponible: round2(disponible - monto),
    };
  }

  // -------------------------------------------------------------- Bloqueo

  /**
   * Bloquea o desbloquea la tarjeta. Es la accion tipica que dispara el
   * asistente de atencion al cliente cuando reportan robo o extravio.
   */
  async setBlock(clerkId: string, cardId: number, accion: string) {
    const normalized = String(accion ?? '').toLowerCase();

    if (normalized !== 'bloquear' && normalized !== 'desbloquear') {
      throw new BadRequestException(
        'La accion debe ser "bloquear" o "desbloquear"',
      );
    }

    const card = await this.ownedCard(clerkId, cardId);
    card.status =
      normalized === 'bloquear' ? CardStatus.BLOQUEADA : CardStatus.ACTIVA;

    await this.cardRepository.save(card);
    return this.toPublicCard(card);
  }

  // -------------------------------------------------------------- Resumen

  /** Total consumido y aprobado con una tarjeta, opcionalmente en un rango. */
  private async consumedAmount(
    cardId: number,
    from?: Date,
    to?: Date,
  ): Promise<number> {
    const { total } = await this.authorizationRepository
      .createQueryBuilder('authorization')
      .select('COALESCE(SUM(authorization.amount), 0)', 'total')
      .where('authorization.cardId = :cardId', { cardId })
      .andWhere('authorization.status = :status', {
        status: AuthorizationStatus.APROBADA,
      })
      .andWhere(
        from && to ? 'authorization.createdAt BETWEEN :from AND :to' : '1=1',
        {
          from,
          to,
        },
      )
      .getRawOne<{ total: string }>();

    return round2(Number(total));
  }

  /**
   * Resumen mensual de una tarjeta de credito.
   *
   * El CFT se calcula capitalizando la TNA mensualmente (CFT = TEA en este
   * modelo simplificado, sin cargos ni impuestos adicionales).
   */
  async statement(clerkId: string, cardId: number) {
    const card = await this.ownedCard(clerkId, cardId);

    if (card.type !== CardType.CREDITO) {
      throw new BadRequestException(
        'Solo las tarjetas de credito tienen resumen',
      );
    }

    const now = new Date();
    const desde = new Date(now.getFullYear(), now.getMonth(), 1);
    const hasta = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const vencimiento = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      DIA_VENCIMIENTO,
    );

    const consumos = await this.authorizationRepository.find({
      where: {
        card: { id: card.id },
        status: AuthorizationStatus.APROBADA,
        createdAt: Between(desde, hasta),
      },
      order: { createdAt: 'DESC' },
    });

    const totalAPagar = round2(
      consumos.reduce((sum, consumo) => sum + Number(consumo.amount), 0),
    );

    const tea = Math.pow(1 + TNA_CREDITO / 12, 12) - 1;

    return {
      periodo: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      vencimiento: vencimiento.toISOString().slice(0, 10),
      totalAPagar,
      pagoMinimo: round2(totalAPagar * PAGO_MINIMO_PCT),
      tna: round2(TNA_CREDITO * 100),
      cft: round2(tea * 100),
      limite: Number(card.limite),
      limiteDisponible: round2(
        Number(card.limite) - (await this.consumedAmount(card.id)),
      ),
      consumos: consumos.map((consumo) => ({
        id: consumo.id,
        fecha: consumo.createdAt,
        comercio: consumo.comercio,
        monto: Number(consumo.amount),
        cuotas: consumo.cuotas,
      })),
    };
  }

  // ---------------------------------------------------------------- Salida

  private async toPublicCard(card: Card) {
    const base = {
      id: card.id,
      tipo: card.type,
      numeroEnmascarado: maskCardNumber(card.number),
      cbuAsociado: card.cbuAsociado,
      limite: card.limite === null ? null : Number(card.limite),
      estado: card.status,
      vencimiento: card.expiresAt,
    };

    if (card.type !== CardType.CREDITO) return base;

    return {
      ...base,
      limiteDisponible: round2(
        Number(card.limite) - (await this.consumedAmount(card.id)),
      ),
    };
  }
}
