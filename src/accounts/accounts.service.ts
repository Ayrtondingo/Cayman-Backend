import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Currency } from '../common/enums/currency.enum';
import { CentralBankService } from '../central-bank/central-bank.service';
import { DolarService } from '../market/dolar.service';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';

/** Redondeo a 2 decimales, para no arrastrar el error del punto flotante a los saldos. */
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Bono de bienvenida al abrir la caja en dolares. */
const BONO_USD = Number(process.env.BONO_APERTURA_USD ?? 10000);

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    private readonly centralBankService: CentralBankService,
    private readonly dolarService: DolarService,
    private readonly dataSource: DataSource,
  ) {}

  /** Todas las cajas de ahorro del cliente, una por moneda. */
  async findAllByUser(clerkId: string): Promise<Account[]> {
    return this.accountRepository.find({
      where: { user: { id: clerkId } },
      relations: ['user'],
      order: { currency: 'ASC' },
    });
  }

  async findByUserAndCurrency(
    clerkId: string,
    currency: Currency,
  ): Promise<Account | null> {
    return this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency },
      relations: ['user'],
    });
  }

  /**
   * La caja en pesos es la cuenta principal: existe desde que la persona se
   * registra en el Banco Central y es la que se usa por defecto.
   */
  async findPrimary(clerkId: string): Promise<Account | null> {
    return this.findByUserAndCurrency(clerkId, Currency.ARS);
  }

  async getBalance(clerkId: string) {
    if (!clerkId) {
      return {
        balance: 0,
        fullName: 'No autenticado',
        cbu: null,
        currency: Currency.ARS,
      };
    }

    const account = await this.findPrimary(clerkId);

    if (!account) {
      return {
        balance: 0,
        fullName: 'Sin cuenta vinculada',
        cbu: null,
        currency: Currency.ARS,
      };
    }

    return {
      balance: Number(account.balance),
      fullName: account.user?.fullName,
      cbu: account.cbu,
      currency: account.currency,
    };
  }

  /** Saldos de todas las monedas de una sola vez, para el dashboard. */
  async getBalances(clerkId: string) {
    const accounts = await this.findAllByUser(clerkId);

    return accounts.map((account) => ({
      id: account.id,
      cbu: account.cbu,
      alias: account.alias,
      currency: account.currency,
      balance: Number(account.balance),
    }));
  }

  /**
   * Abre una caja de ahorro en la moneda pedida.
   *
   * En ARS el Banco Central no crea nada (esa caja ya nace con POST /persons),
   * asi que este metodo sirve sobre todo para USD.
   */
  async openAccount(clerkId: string, currency: Currency): Promise<Account> {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!user.dni) {
      throw new NotFoundException(
        'El cliente no tiene DNI cargado. Sincronizalo primero con el Banco Central.',
      );
    }

    const existing = await this.findByUserAndCurrency(clerkId, currency);
    if (existing?.cbu) {
      return existing;
    }

    // El Banco Central responde 200 si la cuenta ya existia y 201 si la creo:
    // en los dos casos devuelve el CBU, que es lo unico que necesitamos.
    const remote = await this.centralBankService.openAccount(
      user.dni,
      currency,
    );

    const esNueva = !existing;

    const account =
      existing ??
      this.accountRepository.create({
        currency,
        balance: 0,
        user,
      });

    account.cbu = remote.cbu;
    account.alias = remote.alias ?? account.alias ?? null;

    // Bono de bienvenida, solo al abrir la caja en dolares por primera vez.
    // Va con su movimiento: la plata no puede aparecer sin explicacion.
    const bono = esNueva && currency === Currency.USD ? BONO_USD : 0;

    if (bono <= 0) {
      return this.accountRepository.save(account);
    }

    account.balance = round2(Number(account.balance) + bono);

    return this.dataSource.transaction(async (manager) => {
      const guardada = await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount: bono,
          type: TransactionType.DEPOSIT,
          category: TransactionCategory.DEPOSITO,
          description: 'Bono de bienvenida por abrir la caja en dolares',
          status: TransactionStatus.LOCAL,
          account: guardada,
        }),
      );

      return guardada;
    });
  }

  // ------------------------------------------------------ Operaciones de caja

  /** Busca una cuenta del cliente por CBU, verificando que sea suya. */
  private async ownedAccount(clerkId: string, cbu: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { cbu, user: { id: clerkId } },
      relations: ['user'],
    });

    if (!account) {
      throw new NotFoundException(
        'Cuenta no encontrada o no pertenece al cliente',
      );
    }

    return account;
  }

  private assertPositive(monto: number) {
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }
  }

  /**
   * @deprecated El cliente no puede acreditarse plata a si mismo. Los ajustes
   * de saldo los hace el gerente desde administracion, que ademas deja
   * registrado quien los hizo. Se mantiene el metodo para uso interno.
   */
  async deposit(clerkId: string, cbu: string, monto: number) {
    this.assertPositive(monto);
    const account = await this.ownedAccount(clerkId, cbu);

    account.balance = round2(Number(account.balance) + monto);
    await this.accountRepository.save(account);

    const movement = await this.transactionRepository.save(
      this.transactionRepository.create({
        amount: monto,
        type: TransactionType.DEPOSIT,
        description: `Deposito en ${account.currency}`,
        category: TransactionCategory.DEPOSITO,
        status: TransactionStatus.LOCAL,
        account,
      }),
    );

    return this.toMovement(movement, Number(account.balance), account.currency);
  }

  async withdraw(clerkId: string, cbu: string, monto: number) {
    this.assertPositive(monto);
    const account = await this.ownedAccount(clerkId, cbu);

    if (Number(account.balance) < monto) {
      throw new BadRequestException('Saldo insuficiente');
    }

    account.balance = round2(Number(account.balance) - monto);
    await this.accountRepository.save(account);

    const movement = await this.transactionRepository.save(
      this.transactionRepository.create({
        amount: -monto,
        type: TransactionType.WITHDRAWAL,
        description: `Extraccion en ${account.currency}`,
        category: TransactionCategory.EXTRACCION,
        status: TransactionStatus.LOCAL,
        account,
      }),
    );

    return this.toMovement(movement, Number(account.balance), account.currency);
  }

  /**
   * Compra o venta de dolares entre las dos cajas del mismo cliente.
   *
   * - `compra`: paga ARS y recibe USD, al valor de venta del banco.
   * - `venta`: entrega USD y recibe ARS, al valor de compra del banco.
   *
   * El monto siempre se expresa en USD, que es la parte que el cliente elige.
   * Las dos patas se guardan en una transaccion de base: si una falla, no queda
   * dinero descontado de un lado y no acreditado del otro.
   */
  async exchange(
    clerkId: string,
    operacion: 'compra' | 'venta',
    montoUsd: number,
  ) {
    this.assertPositive(montoUsd);

    if (operacion !== 'compra' && operacion !== 'venta') {
      throw new BadRequestException('La operacion debe ser "compra" o "venta"');
    }

    const arsAccount = await this.findByUserAndCurrency(clerkId, Currency.ARS);
    const usdAccount = await this.findByUserAndCurrency(clerkId, Currency.USD);

    if (!arsAccount) {
      throw new NotFoundException('No tenes caja de ahorro en pesos');
    }

    if (!usdAccount) {
      throw new NotFoundException(
        'No tenes caja de ahorro en dolares. Abrila primero con POST /accounts',
      );
    }

    const cotizacion = await this.dolarService.getCotizacionOperativa();
    const precio =
      operacion === 'compra' ? cotizacion.venta : cotizacion.compra;
    const montoArs = round2(montoUsd * precio);

    const origen = operacion === 'compra' ? arsAccount : usdAccount;
    const destino = operacion === 'compra' ? usdAccount : arsAccount;
    const montoOrigen = operacion === 'compra' ? montoArs : montoUsd;
    const montoDestino = operacion === 'compra' ? montoUsd : montoArs;

    if (Number(origen.balance) < montoOrigen) {
      throw new BadRequestException(
        `Saldo insuficiente en ${origen.currency}: necesitas ${montoOrigen}`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      origen.balance = round2(Number(origen.balance) - montoOrigen);
      destino.balance = round2(Number(destino.balance) + montoDestino);

      await manager.save(Account, origen);
      await manager.save(Account, destino);

      const descripcion =
        operacion === 'compra'
          ? `Compra de USD ${montoUsd} a ${precio}`
          : `Venta de USD ${montoUsd} a ${precio}`;

      await manager.save(
        manager.create(Transaction, {
          amount: -montoOrigen,
          type: TransactionType.WITHDRAWAL,
          description: descripcion,
          category: TransactionCategory.CAMBIO_DIVISAS,
          status: TransactionStatus.LOCAL,
          account: origen,
        }),
      );

      await manager.save(
        manager.create(Transaction, {
          amount: montoDestino,
          type: TransactionType.DEPOSIT,
          description: descripcion,
          category: TransactionCategory.CAMBIO_DIVISAS,
          status: TransactionStatus.LOCAL,
          account: destino,
        }),
      );
    });

    return {
      operacion,
      montoOrigen,
      monedaOrigen: origen.currency,
      montoDestino,
      monedaDestino: destino.currency,
      cotizacionUsada: precio,
      casa: cotizacion.casa,
      fechaCotizacion: cotizacion.fechaActualizacion,
      saldos: {
        [origen.currency]: Number(origen.balance),
        [destino.currency]: Number(destino.balance),
      },
    };
  }

  /** Movimientos de una cuenta, del mas reciente al mas viejo. */
  async getMovements(clerkId: string, cbu: string, limit = 100) {
    const account = await this.ownedAccount(clerkId, cbu);

    const movements = await this.transactionRepository.find({
      where: { account: { id: account.id } },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    // El saldo que se muestra en cada fila es el que quedaba justo despues de
    // ese movimiento, reconstruido hacia atras desde el saldo actual.
    let running = Number(account.balance);

    return movements.map((movement) => {
      const saldo = running;
      running = round2(running - Number(movement.amount));
      return this.toMovement(movement, saldo, account.currency);
    });
  }

  private toMovement(movement: Transaction, saldo: number, currency: Currency) {
    const amount = Number(movement.amount);

    return {
      id: movement.id,
      fecha: movement.createdAt,
      tipo: movement.type,
      monto: Math.abs(amount),
      signo: amount < 0 ? 'debito' : 'credito',
      moneda: currency,
      descripcion: movement.description,
      estado: movement.status,
      saldo,
    };
  }

  /**
   * Asigna o cambia el alias de una caja de ahorro.
   *
   * El Banco Central expone los alias en dos endpoints distintos segun el tipo
   * de cuenta: la caja en pesos vive en /persons y las demas en /accounts.
   * Por eso las cajas en dolares se quedaban sin alias: `POST /accounts` no lo
   * acepta en el body y nadie llamaba despues al endpoint que corresponde.
   */
  async updateAlias(clerkId: string, cbu: string, alias: string) {
    const limpio = String(alias ?? '').trim();

    // El Banco Central exige alias unicos a nivel global y con este formato.
    if (!/^[A-Za-z0-9.-]{6,20}$/.test(limpio)) {
      throw new BadRequestException(
        'El alias debe tener entre 6 y 20 caracteres, y solo letras, numeros, puntos o guiones',
      );
    }

    const account = await this.ownedAccount(clerkId, cbu);

    if (!account.cbu) {
      throw new BadRequestException('La cuenta todavia no tiene CBU');
    }

    if (account.currency === Currency.ARS) {
      await this.centralBankService.updateAlias(account.cbu, limpio);
    } else {
      await this.centralBankService.updateAccountAlias(account.cbu, limpio);
    }

    account.alias = limpio;
    await this.accountRepository.save(account);

    return {
      cbu: account.cbu,
      moneda: account.currency,
      alias: account.alias,
    };
  }
}
