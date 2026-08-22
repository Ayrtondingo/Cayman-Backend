import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  FixedTerm,
  FixedTermStatus,
  FixedTermType,
} from './entities/fixed-term.entity';
import { CedearOrder, OrderType } from './entities/cedear-order.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Currency } from '../common/enums/currency.enum';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';
import { RatesService } from '../market/rates.service';

const round2 = (value: number) => Math.round(value * 100) / 100;

const CAPITAL_MINIMO = Number(process.env.FIXED_TERM_MIN ?? 1000);
const PLAZO_MINIMO_DIAS = Number(process.env.FIXED_TERM_MIN_DAYS ?? 30);

@Injectable()
export class InvestmentsService {
  constructor(
    @InjectRepository(FixedTerm)
    private readonly fixedTermRepository: Repository<FixedTerm>,
    @InjectRepository(CedearOrder)
    private readonly orderRepository: Repository<CedearOrder>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ratesService: RatesService,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------------------------------------------- Plazos fijos

  private async arsAccount(clerkId: string): Promise<Account> {
    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency: Currency.ARS },
    });

    if (!account?.cbu) {
      throw new BadRequestException(
        'Necesitas una caja de ahorro en pesos con CBU',
      );
    }

    return account;
  }

  /**
   * Constituye un plazo fijo debitando el capital de la caja en pesos.
   *
   * Interes simple: `interes = capital * TNA * dias / 365`. El BCRA ya no fija
   * un piso minimo, asi que si no se manda TNA se usa la mejor del mercado
   * segun ArgentinaDatos.
   */
  async createFixedTerm(
    clerkId: string,
    data: { capital: number; plazoDias: number; tna?: number; tipo?: string },
  ) {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const capital = Number(data.capital);
    const plazoDias = Number(data.plazoDias);
    const tipo = String(
      data.tipo ?? FixedTermType.TRADICIONAL,
    ).toLowerCase() as FixedTermType;

    if (!Object.values(FixedTermType).includes(tipo)) {
      throw new BadRequestException(
        `Tipo invalido. Valores validos: ${Object.values(FixedTermType).join(', ')}`,
      );
    }

    if (!Number.isFinite(capital) || capital < CAPITAL_MINIMO) {
      throw new BadRequestException(`El capital minimo es ${CAPITAL_MINIMO}`);
    }

    if (!Number.isInteger(plazoDias) || plazoDias < PLAZO_MINIMO_DIAS) {
      throw new BadRequestException(
        `El plazo minimo es de ${PLAZO_MINIMO_DIAS} dias`,
      );
    }

    const tna =
      data.tna !== undefined && data.tna !== null
        ? Number(data.tna)
        : await this.ratesService.getTnaPlazoFijoReferencia();

    if (!Number.isFinite(tna) || tna < 0) {
      throw new BadRequestException('La TNA no puede ser negativa');
    }

    const account = await this.arsAccount(clerkId);

    if (Number(account.balance) < capital) {
      throw new BadRequestException('Saldo insuficiente');
    }

    // En UVA hay que congelar el valor del indice del dia del alta para poder
    // ajustar el capital al vencimiento.
    let uvaAtStart: number | null = null;
    if (tipo === FixedTermType.UVA) {
      const uva = await this.ratesService.getUvaActual();
      if (!uva) {
        throw new BadRequestException('No se pudo obtener el valor de la UVA');
      }
      uvaAtStart = uva.valor;
    }

    const maturity = new Date();
    maturity.setDate(maturity.getDate() + plazoDias);

    const fixedTerm = await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) - capital);
      await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount: -capital,
          type: TransactionType.WITHDRAWAL,
          description: `Constitucion de plazo fijo ${tipo}`,
          category: TransactionCategory.INVERSION,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      return manager.save(
        manager.create(FixedTerm, {
          capital,
          termDays: plazoDias,
          tna,
          type: tipo,
          uvaAtStart,
          maturityDate: maturity.toISOString().slice(0, 10),
          status: FixedTermStatus.VIGENTE,
          cbu: account.cbu,
          user,
        }),
      );
    });

    return this.toPublicFixedTerm(fixedTerm);
  }

  async findFixedTerm(clerkId: string, id: number) {
    const fixedTerm = await this.fixedTermRepository.findOne({
      where: { id, user: { id: clerkId } },
    });

    if (!fixedTerm) {
      throw new NotFoundException(
        'Plazo fijo no encontrado o no pertenece al cliente',
      );
    }

    return this.toPublicFixedTerm(fixedTerm);
  }

  async findFixedTermsByUser(clerkId: string) {
    const fixedTerms = await this.fixedTermRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      fixedTerms.map((fixedTerm) => this.toPublicFixedTerm(fixedTerm)),
    );
  }

  async findFixedTermsByDni(dni: string) {
    const user = await this.userRepository.findOne({ where: { dni } });
    if (!user) throw new NotFoundException('No hay ningun cliente con ese DNI');
    return this.findFixedTermsByUser(user.id);
  }

  /**
   * Acredita un plazo fijo vencido: devuelve capital mas intereses a la caja.
   * No se puede antes del vencimiento, que es la contrapartida de la tasa.
   */
  async settleFixedTerm(clerkId: string, id: number) {
    const fixedTerm = await this.fixedTermRepository.findOne({
      where: { id, user: { id: clerkId } },
    });

    if (!fixedTerm) {
      throw new NotFoundException(
        'Plazo fijo no encontrado o no pertenece al cliente',
      );
    }

    if (fixedTerm.status === FixedTermStatus.ACREDITADO) {
      throw new BadRequestException('El plazo fijo ya fue acreditado');
    }

    if (new Date(fixedTerm.maturityDate) > new Date()) {
      throw new BadRequestException(
        `El plazo fijo vence el ${fixedTerm.maturityDate}: todavia no se puede acreditar`,
      );
    }

    const account = await this.accountRepository.findOne({
      where: { cbu: fixedTerm.cbu },
    });
    if (!account)
      throw new NotFoundException('La cuenta del plazo fijo ya no existe');

    const { total } = await this.projectFixedTerm(fixedTerm);

    await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) + total);
      await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount: total,
          type: TransactionType.DEPOSIT,
          description: `Acreditacion de plazo fijo #${fixedTerm.id}`,
          category: TransactionCategory.INVERSION,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      fixedTerm.status = FixedTermStatus.ACREDITADO;
      await manager.save(FixedTerm, fixedTerm);
    });

    return {
      ...(await this.toPublicFixedTerm(fixedTerm)),
      acreditado: total,
      saldoCuenta: Number(account.balance),
    };
  }

  /**
   * Calcula capital ajustado e intereses de un plazo fijo.
   *
   * En UVA el capital primero se ajusta por la variacion del indice y despues
   * se le aplica la tasa, que es como funciona un UVA real.
   */
  private async projectFixedTerm(fixedTerm: FixedTerm) {
    const capital = Number(fixedTerm.capital);
    const tna = Number(fixedTerm.tna);
    let capitalAjustado = capital;
    let coeficienteUva: number | null = null;

    if (fixedTerm.type === FixedTermType.UVA && fixedTerm.uvaAtStart) {
      const uva = await this.ratesService.getUvaActual();
      if (uva) {
        coeficienteUva = uva.valor / Number(fixedTerm.uvaAtStart);
        capitalAjustado = round2(capital * coeficienteUva);
      }
    }

    const interes = round2((capitalAjustado * tna * fixedTerm.termDays) / 365);

    return {
      capitalAjustado,
      coeficienteUva,
      interes,
      total: round2(capitalAjustado + interes),
    };
  }

  private async toPublicFixedTerm(fixedTerm: FixedTerm) {
    const projection = await this.projectFixedTerm(fixedTerm);
    const vencido = new Date(fixedTerm.maturityDate) <= new Date();

    return {
      id: fixedTerm.id,
      capital: Number(fixedTerm.capital),
      capitalAjustado: projection.capitalAjustado,
      coeficienteUva: projection.coeficienteUva,
      tna: round2(Number(fixedTerm.tna) * 100),
      plazoDias: fixedTerm.termDays,
      interes: projection.interes,
      totalAlVencimiento: projection.total,
      tipo: fixedTerm.type,
      fechaAlta: fixedTerm.createdAt,
      fechaVencimiento: fixedTerm.maturityDate,
      estado:
        fixedTerm.status === FixedTermStatus.VIGENTE && vencido
          ? FixedTermStatus.VENCIDO
          : fixedTerm.status,
      cbu: fixedTerm.cbu,
    };
  }

  // -------------------------------------------------------------- CEDEARs

  async listCedears() {
    return this.ratesService.getCedears();
  }

  /**
   * Ejecuta una orden de compra o venta.
   *
   * La compra debita de la caja en pesos; la venta acredita. Antes de vender
   * se valida la tenencia: sin eso se podrian vender papeles que no se tienen.
   */
  async placeOrder(
    clerkId: string,
    data: { ticker: string; cantidad: number; tipo: string },
  ) {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const tipo = String(data.tipo ?? '').toLowerCase() as OrderType;
    const ticker = String(data.ticker ?? '').toUpperCase();
    const cantidad = Number(data.cantidad);

    if (!Object.values(OrderType).includes(tipo)) {
      throw new BadRequestException('El tipo debe ser "compra" o "venta"');
    }

    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new BadRequestException(
        'La cantidad debe ser un entero mayor a cero',
      );
    }

    const cedear = await this.ratesService.getCedear(ticker);
    if (!cedear) {
      throw new NotFoundException(`El CEDEAR ${ticker} no cotiza o no existe`);
    }

    // Se compra al precio de venta del mercado y se vende al de compra.
    const precio = tipo === OrderType.COMPRA ? cedear.venta : cedear.compra;
    const monto = round2(precio * cantidad);
    const account = await this.arsAccount(clerkId);

    if (tipo === OrderType.COMPRA) {
      if (Number(account.balance) < monto) {
        throw new BadRequestException(
          `Saldo insuficiente: la orden es de ${monto}`,
        );
      }
    } else {
      const holding = await this.holdingOf(clerkId, ticker);
      if (holding.cantidad < cantidad) {
        throw new BadRequestException(
          `No tenes suficientes ${ticker}: tenencia actual ${holding.cantidad}`,
        );
      }
    }

    const order = await this.dataSource.transaction(async (manager) => {
      const delta = tipo === OrderType.COMPRA ? -monto : monto;
      account.balance = round2(Number(account.balance) + delta);
      await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount: delta,
          type:
            tipo === OrderType.COMPRA
              ? TransactionType.WITHDRAWAL
              : TransactionType.DEPOSIT,
          description: `${tipo === OrderType.COMPRA ? 'Compra' : 'Venta'} de ${cantidad} ${ticker}`,
          category: TransactionCategory.INVERSION,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      return manager.save(
        manager.create(CedearOrder, {
          ticker,
          quantity: cantidad,
          type: tipo,
          price: precio,
          user,
        }),
      );
    });

    return {
      id: order.id,
      ticker,
      cantidad,
      tipo,
      precio,
      monto,
      estado: 'ejecutada',
      saldoCuenta: Number(account.balance),
    };
  }

  /** Tenencia de un ticker: cantidad neta y precio promedio ponderado de compra. */
  private async holdingOf(clerkId: string, ticker: string) {
    const orders = await this.orderRepository.find({
      where: { user: { id: clerkId }, ticker },
      order: { createdAt: 'ASC' },
    });

    let cantidad = 0;
    let costoTotal = 0;

    for (const order of orders) {
      if (order.type === OrderType.COMPRA) {
        cantidad += order.quantity;
        costoTotal += order.quantity * Number(order.price);
      } else {
        // Al vender se retira costo al promedio vigente, para que el precio
        // promedio de lo que queda no se distorsione.
        const promedio = cantidad > 0 ? costoTotal / cantidad : 0;
        cantidad -= order.quantity;
        costoTotal -= order.quantity * promedio;
      }
    }

    return {
      ticker,
      cantidad,
      precioPromedio: cantidad > 0 ? round2(costoTotal / cantidad) : 0,
    };
  }

  /** Portafolio completo con valuacion a precio de mercado. */
  async getPortfolio(clerkId: string) {
    const orders = await this.orderRepository.find({
      where: { user: { id: clerkId } },
    });

    const tickers = [...new Set(orders.map((order) => order.ticker))];
    const cotizaciones = await this.ratesService.getCedears();

    const posiciones = await Promise.all(
      tickers.map(async (ticker) => {
        const holding = await this.holdingOf(clerkId, ticker);
        const cotizacion = cotizaciones.find((c) => c.ticker === ticker);
        const precioActual = cotizacion?.precioARS ?? 0;
        const valuacion = round2(holding.cantidad * precioActual);
        const costo = round2(holding.cantidad * holding.precioPromedio);

        return {
          ...holding,
          precioActual,
          valuacion,
          resultado: round2(valuacion - costo),
          resultadoPct:
            costo > 0 ? round2(((valuacion - costo) / costo) * 100) : 0,
        };
      }),
    );

    const conTenencia = posiciones.filter((posicion) => posicion.cantidad > 0);

    return {
      posiciones: conTenencia,
      valuacionTotal: round2(
        conTenencia.reduce((sum, posicion) => sum + posicion.valuacion, 0),
      ),
    };
  }

  async getPortfolioByDni(dni: string) {
    const user = await this.userRepository.findOne({ where: { dni } });
    if (!user) throw new NotFoundException('No hay ningun cliente con ese DNI');
    return this.getPortfolio(user.id);
  }
}
