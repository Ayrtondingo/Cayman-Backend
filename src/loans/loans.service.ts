import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Loan, LoanStatus } from './entities/loan.entity';
import {
  InstallmentStatus,
  LoanInstallment,
} from './entities/loan-installment.entity';
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
import { CentralBankService } from '../central-bank/central-bank.service';
import {
  amortizationSchedule,
  dueDateFor,
  effectiveAnnualRate,
  frenchInstallment,
} from './amortization';

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Peor situacion crediticia que este banco acepta para dar un prestamo.
 * El estandar dice que un titular en 3 o peor no deberia poder operar.
 */
const MAX_SITUACION_ACEPTADA = Number(process.env.LOAN_MAX_SITUACION ?? 2);

/**
 * Nombre con el que este banco figura en la central de deudores. El Banco
 * Central lo asigna solo, a partir de la API key: sirve para distinguir
 * nuestras propias deudas de las de otras entidades.
 */
const BANK_NAME = process.env.BANK_NAME || 'Cayman-Shadow-Bank';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectRepository(Loan)
    private readonly loanRepository: Repository<Loan>,
    @InjectRepository(LoanInstallment)
    private readonly installmentRepository: Repository<LoanInstallment>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly ratesService: RatesService,
    private readonly centralBankService: CentralBankService,
    private readonly dataSource: DataSource,
  ) {}

  // ------------------------------------------------------------ Simulacion

  /**
   * Simula un prestamo sin crearlo. Si no se pasa TNA, usa la mediana del
   * mercado publicada por ArgentinaDatos.
   */
  async simulate(data: { monto: number; plazoMeses: number; tna?: number }) {
    const monto = Number(data.monto);
    const plazoMeses = Number(data.plazoMeses);

    if (!Number.isFinite(monto) || monto <= 0) {
      throw new BadRequestException('El monto debe ser mayor a cero');
    }

    if (!Number.isInteger(plazoMeses) || plazoMeses < 1 || plazoMeses > 120) {
      throw new BadRequestException(
        'El plazo debe ser un entero entre 1 y 120 meses',
      );
    }

    const tna =
      data.tna !== undefined && data.tna !== null
        ? Number(data.tna)
        : await this.ratesService.getTnaPrestamoReferencia();

    if (!Number.isFinite(tna) || tna < 0) {
      throw new BadRequestException('La TNA no puede ser negativa');
    }

    const tabla = amortizationSchedule(monto, tna, plazoMeses);
    const totalPagado = round2(tabla.reduce((sum, row) => sum + row.cuota, 0));

    return {
      monto,
      plazoMeses,
      cuota: frenchInstallment(monto, tna, plazoMeses),
      tna: round2(tna * 100),
      tea: round2(effectiveAnnualRate(tna) * 100),
      // Sin cargos ni impuestos adicionales, el CFT coincide con la TEA.
      cft: round2(effectiveAnnualRate(tna) * 100),
      totalPagado,
      totalIntereses: round2(totalPagado - monto),
      tasaDeReferencia: data.tna === undefined || data.tna === null,
      tabla,
    };
  }

  // -------------------------------------------------------------- Solicitud

  /**
   * Otorga un prestamo y acredita el capital en la caja en pesos.
   *
   * Antes consulta la central de deudores: si el titular esta en situacion 3 o
   * peor, se rechaza. Si el Banco Central no tiene datos del DNI, se sigue
   * adelante (no figurar no es lo mismo que estar mal calificado).
   */
  async request(
    clerkId: string,
    data: { monto: number; plazoMeses: number; tna?: number },
  ) {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency: Currency.ARS },
    });

    if (!account?.cbu) {
      throw new BadRequestException(
        'Necesitas una caja de ahorro en pesos con CBU para recibir el prestamo',
      );
    }

    await this.assertCreditworthy(user.dni);

    const simulation = await this.simulate(data);
    const tna = simulation.tna / 100;

    const loan = await this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(
        manager.create(Loan, {
          amount: simulation.monto,
          termMonths: simulation.plazoMeses,
          tna,
          installmentAmount: simulation.cuota,
          status: LoanStatus.VIGENTE,
          cbu: account.cbu,
          user,
        }),
      );

      await manager.save(
        simulation.tabla.map((row) =>
          manager.create(LoanInstallment, {
            number: row.numero,
            principal: row.capital,
            interest: row.interes,
            total: row.cuota,
            remainingPrincipal: row.saldo,
            dueDate: dueDateFor(row.numero),
            status: InstallmentStatus.PENDIENTE,
            loan: saved,
          }),
        ),
      );

      // Acreditacion del capital en la caja del cliente.
      account.balance = round2(Number(account.balance) + simulation.monto);
      await manager.save(Account, account);

      await manager.save(
        manager.create(Transaction, {
          amount: simulation.monto,
          type: TransactionType.DEPOSIT,
          description: `Acreditacion de prestamo #${saved.id}`,
          category: TransactionCategory.PRESTAMO,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      return saved;
    });

    // El capital adeudado al otorgar es el monto completo.
    await this.informarDeuda(user.dni, simulation.monto);

    return this.findOne(clerkId, loan.id);
  }

  /**
   * Corta la solicitud si el titular esta mal calificado en la central de deudores.
   * Un fallo de la API del Banco Central no debe bloquear el prestamo, pero
   * una situacion 3+ confirmada si.
   */
  private async assertCreditworthy(dni: string | null) {
    if (!dni) return;

    let report: Awaited<ReturnType<CentralBankService['getCreditSituation']>> = null;

    try {
      report = await this.centralBankService.getCreditSituation(dni);
    } catch {
      // El Banco Central no contesta: se sigue sin el chequeo. Un problema de
      // conectividad no puede dejar al banco sin poder operar.
      return;
    }

    // No figurar en la central no es lo mismo que estar mal calificado.
    if (!report) return;

    if (report.situacion > MAX_SITUACION_ACEPTADA) {
      throw new ForbiddenException(
        `Situacion crediticia ${report.situacion}: no se puede otorgar el prestamo`,
      );
    }

    // Un titular no puede tener prestamos en dos bancos a la vez. Las deudas
    // que informa este banco no cuentan: esas son nuestras y ya las conocemos.
    const enOtrosBancos = (report.deudas ?? []).filter(
      (deuda) => deuda.entidad !== BANK_NAME && Number(deuda.monto) > 0,
    );

    if (enOtrosBancos.length > 0) {
      const detalle = enOtrosBancos
        .map((deuda) => `${deuda.entidad} (${deuda.monto})`)
        .join(', ');

      throw new ForbiddenException(
        `El titular ya tiene deuda informada en otra entidad: ${detalle}. ` +
          'Tiene que cancelarla antes de tomar un prestamo con nosotros.',
      );
    }
  }

  /**
   * Informa al Banco Central lo que el titular le debe a este banco.
   *
   * Es la contraparte de `assertCreditworthy`: si no informaramos, los demas
   * bancos no podrian aplicar la misma regla y el mecanismo funcionaria en un
   * solo sentido. Un fallo al informar no revierte el prestamo, que ya esta
   * acreditado: se registra y sigue.
   */
  private async informarDeuda(dni: string | null, capitalAdeudado: number) {
    if (!dni) return;

    try {
      await this.centralBankService.reportDebt(
        dni,
        round2(capitalAdeudado),
        // Un prestamo al dia es situacion 1. El seguimiento de la mora queda
        // fuera de alcance por ahora.
        1,
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo informar la deuda de ${dni} al Banco Central: ${(error as Error).message}`,
      );
    }
  }

  // ---------------------------------------------------------------- Lectura

  async findAllByUser(clerkId: string) {
    const loans = await this.loanRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(loans.map((loan) => this.toPublicLoan(loan)));
  }

  async findOne(clerkId: string, loanId: number) {
    const loan = await this.ownedLoan(clerkId, loanId);
    return this.toPublicLoan(loan);
  }

  private async ownedLoan(clerkId: string, loanId: number): Promise<Loan> {
    const loan = await this.loanRepository.findOne({
      where: { id: loanId, user: { id: clerkId } },
    });

    if (!loan) {
      throw new NotFoundException(
        'Prestamo no encontrado o no pertenece al cliente',
      );
    }

    return loan;
  }

  private async installmentsOf(loanId: number) {
    return this.installmentRepository.find({
      where: { loan: { id: loanId } },
      order: { number: 'ASC' },
    });
  }

  // ------------------------------------------------------------------ Pagos

  /** Paga la proxima cuota pendiente, debitandola de la caja en pesos. */
  async payNextInstallment(clerkId: string, loanId: number) {
    const loan = await this.ownedLoan(clerkId, loanId);

    if (loan.status === LoanStatus.CANCELADO) {
      throw new BadRequestException('El prestamo ya esta cancelado');
    }

    const installments = await this.installmentsOf(loan.id);
    const next = installments.find(
      (i) => i.status === InstallmentStatus.PENDIENTE,
    );

    if (!next) {
      throw new BadRequestException('No quedan cuotas pendientes');
    }

    const account = await this.accountRepository.findOne({
      where: { cbu: loan.cbu },
    });
    if (!account)
      throw new NotFoundException('La cuenta del prestamo ya no existe');

    const monto = Number(next.total);

    if (Number(account.balance) < monto) {
      throw new BadRequestException(
        `Saldo insuficiente: la cuota es de ${monto}`,
      );
    }

    const isLast = installments.every(
      (i) => i.id === next.id || i.status === InstallmentStatus.PAGADA,
    );

    await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) - monto);
      await manager.save(Account, account);

      next.status = InstallmentStatus.PAGADA;
      next.paidAt = new Date();
      await manager.save(LoanInstallment, next);

      await manager.save(
        manager.create(Transaction, {
          amount: -monto,
          type: TransactionType.WITHDRAWAL,
          description: `Cuota ${next.number}/${loan.termMonths} del prestamo #${loan.id}`,
          category: TransactionCategory.PRESTAMO,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      if (isLast) {
        loan.status = LoanStatus.CANCELADO;
        await manager.save(Loan, loan);
      }
    });

    // La deuda informada baja al capital que queda: si no, el titular figura
    // debiendo el monto original para siempre y ningun banco le presta mas.
    await this.informarDeuda(
      (await this.userRepository.findOne({ where: { id: clerkId } }))?.dni ?? null,
      Number(next.remainingPrincipal),
    );

    return {
      numero: next.number,
      capital: Number(next.principal),
      interes: Number(next.interest),
      cuota: monto,
      saldo: Number(next.remainingPrincipal),
      estado: loan.status,
      saldoCuenta: Number(account.balance),
    };
  }

  /**
   * Precancelacion: se paga el capital que queda, sin los intereses de las
   * cuotas futuras, que es justamente la ventaja de cancelar antes.
   */
  async prepay(clerkId: string, loanId: number) {
    const loan = await this.ownedLoan(clerkId, loanId);

    if (loan.status === LoanStatus.CANCELADO) {
      throw new BadRequestException('El prestamo ya esta cancelado');
    }

    const installments = await this.installmentsOf(loan.id);
    const pending = installments.filter(
      (i) => i.status === InstallmentStatus.PENDIENTE,
    );

    if (!pending.length) {
      throw new BadRequestException('No quedan cuotas pendientes');
    }

    const capitalAdeudado = round2(
      pending.reduce(
        (sum, installment) => sum + Number(installment.principal),
        0,
      ),
    );

    const account = await this.accountRepository.findOne({
      where: { cbu: loan.cbu },
    });
    if (!account)
      throw new NotFoundException('La cuenta del prestamo ya no existe');

    if (Number(account.balance) < capitalAdeudado) {
      throw new BadRequestException(
        `Saldo insuficiente: la precancelacion es de ${capitalAdeudado}`,
      );
    }

    const interesesAhorrados = round2(
      pending.reduce(
        (sum, installment) => sum + Number(installment.interest),
        0,
      ),
    );

    await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) - capitalAdeudado);
      await manager.save(Account, account);

      for (const installment of pending) {
        installment.status = InstallmentStatus.PAGADA;
        installment.paidAt = new Date();
        // Al precancelar no se pagan los intereses futuros.
        installment.interest = 0;
        installment.total = Number(installment.principal);
      }
      await manager.save(LoanInstallment, pending);

      await manager.save(
        manager.create(Transaction, {
          amount: -capitalAdeudado,
          type: TransactionType.WITHDRAWAL,
          description: `Precancelacion del prestamo #${loan.id}`,
          category: TransactionCategory.PRESTAMO,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      loan.status = LoanStatus.CANCELADO;
      await manager.save(Loan, loan);
    });

    // Prestamo cancelado: se informa deuda cero para que el titular quede
    // libre en la central y pueda volver a pedir.
    await this.informarDeuda(
      (await this.userRepository.findOne({ where: { id: clerkId } }))?.dni ?? null,
      0,
    );

    return {
      ...(await this.toPublicLoan(loan)),
      capitalCancelado: capitalAdeudado,
      interesesAhorrados,
      cuotasCanceladas: pending.length,
      saldoCuenta: Number(account.balance),
    };
  }

  // ----------------------------------------------------------------- Salida

  private async toPublicLoan(loan: Loan) {
    const installments = await this.installmentsOf(loan.id);
    const pending = installments.filter(
      (i) => i.status === InstallmentStatus.PENDIENTE,
    );

    return {
      id: loan.id,
      monto: Number(loan.amount),
      plazoMeses: loan.termMonths,
      tna: round2(Number(loan.tna) * 100),
      cuota: Number(loan.installmentAmount),
      estado: loan.status,
      cbu: loan.cbu,
      fechaAlta: loan.createdAt,
      cuotasPagadas: installments.length - pending.length,
      capitalAdeudado: round2(
        pending.reduce(
          (sum, installment) => sum + Number(installment.principal),
          0,
        ),
      ),
      proximoVencimiento: pending[0]?.dueDate ?? null,
      cuotas: installments.map((installment) => ({
        numero: installment.number,
        capital: Number(installment.principal),
        interes: Number(installment.interest),
        cuota: Number(installment.total),
        saldo: Number(installment.remainingPrincipal),
        vencimiento: installment.dueDate,
        estado: installment.status,
        pagadaEl: installment.paidAt,
      })),
    };
  }
}
