import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { UtilityCompany } from './entities/utility-company.entity';
import { BillStatus, UtilityBill } from './entities/utility-bill.entity';
import { Account } from '../accounts/entities/account.entity';
import { Currency } from '../common/enums/currency.enum';
import {
  Transaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from '../transactions/entities/transaction.entity';

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Catalogo inicial. Es mock: no hay una API publica que centralice esto. */
const CATALOGO_INICIAL = [
  { nombre: 'Edesur', rubro: 'Electricidad' },
  { nombre: 'Metrogas', rubro: 'Gas' },
  { nombre: 'AySA', rubro: 'Agua' },
  { nombre: 'Fibertel', rubro: 'Internet' },
  { nombre: 'Movistar Hogar', rubro: 'Telefonia' },
  { nombre: 'ABL CABA', rubro: 'Impuestos' },
];

@Injectable()
export class UtilitiesService implements OnModuleInit {
  private readonly logger = new Logger(UtilitiesService.name);

  constructor(
    @InjectRepository(UtilityCompany)
    private readonly companyRepository: Repository<UtilityCompany>,
    @InjectRepository(UtilityBill)
    private readonly billRepository: Repository<UtilityBill>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly dataSource: DataSource,
  ) {}

  /** Siembra el catalogo la primera vez. No pisa nada si ya hay empresas. */
  async onModuleInit() {
    const count = await this.companyRepository.count();
    if (count > 0) return;

    await this.companyRepository.save(
      CATALOGO_INICIAL.map((company) => this.companyRepository.create(company)),
    );
    this.logger.log(
      `Catalogo de servicios sembrado: ${CATALOGO_INICIAL.length} empresas`,
    );
  }

  async listCompanies() {
    const companies = await this.companyRepository.find({
      order: { nombre: 'ASC' },
    });
    return companies.map((company) => ({
      id: company.id,
      nombre: company.nombre,
      rubro: company.rubro,
    }));
  }

  private async findCompany(companyId: number): Promise<UtilityCompany> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
    });
    if (!company)
      throw new NotFoundException('Empresa de servicios no encontrada');
    return company;
  }

  /**
   * Deuda de un cliente con la empresa.
   * `numeroCliente` es el identificador ante la empresa, no ante el banco.
   */
  async getDebt(companyId: number, numeroCliente: string) {
    if (!numeroCliente) {
      throw new BadRequestException('Falta el numeroCliente');
    }

    const company = await this.findCompany(companyId);

    const bills = await this.billRepository.find({
      where: {
        company: { id: company.id },
        numeroCliente,
        status: BillStatus.PENDIENTE,
      },
      order: { vencimiento: 'ASC' },
    });

    const total = round2(
      bills.reduce((sum, bill) => sum + Number(bill.importe), 0),
    );

    return {
      empresa: company.nombre,
      numeroCliente,
      totalAdeudado: total,
      facturas: bills.map((bill) => ({
        id: bill.id,
        importe: Number(bill.importe),
        vencimiento: bill.vencimiento,
        estado: bill.status,
        vencida: new Date(bill.vencimiento) < new Date(),
      })),
    };
  }

  /**
   * Paga la factura pendiente mas vieja del cliente, debitando de la caja en pesos.
   * El importe tiene que coincidir con el de la factura: pagos parciales no.
   */
  async payBill(
    clerkId: string,
    companyId: number,
    data: { numeroCliente: string; importe: number },
  ) {
    const company = await this.findCompany(companyId);
    const importe = Number(data.importe);

    if (!data.numeroCliente) {
      throw new BadRequestException('Falta el numeroCliente');
    }

    if (!Number.isFinite(importe) || importe <= 0) {
      throw new BadRequestException('El importe debe ser mayor a cero');
    }

    const bill = await this.billRepository.findOne({
      where: {
        company: { id: company.id },
        numeroCliente: data.numeroCliente,
        status: BillStatus.PENDIENTE,
      },
      order: { vencimiento: 'ASC' },
    });

    if (!bill) {
      throw new NotFoundException(
        'No hay facturas pendientes para ese numero de cliente',
      );
    }

    if (round2(Number(bill.importe)) !== round2(importe)) {
      throw new BadRequestException(
        `El importe no coincide con la factura: son ${Number(bill.importe)}`,
      );
    }

    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency: Currency.ARS },
    });

    if (!account) {
      throw new NotFoundException('No tenes caja de ahorro en pesos');
    }

    if (Number(account.balance) < importe) {
      throw new BadRequestException('Saldo insuficiente');
    }

    // Debitar y marcar la factura pagada tienen que pasar juntos: si no, se
    // cobra sin cancelar la deuda o al reves.
    await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) - importe);
      await manager.save(Account, account);

      bill.status = BillStatus.PAGADA;
      bill.paidAt = new Date();
      bill.paidByUserId = clerkId;
      await manager.save(UtilityBill, bill);

      await manager.save(
        manager.create(Transaction, {
          amount: -importe,
          type: TransactionType.WITHDRAWAL,
          description: `Pago de ${company.nombre} (cliente ${data.numeroCliente})`,
          category: TransactionCategory.SERVICIOS,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );
    });

    return {
      estado: 'pagada',
      empresa: company.nombre,
      facturaId: bill.id,
      numeroCliente: data.numeroCliente,
      importe: round2(importe),
      fechaPago: bill.paidAt,
      saldoCuenta: Number(account.balance),
    };
  }

  /** Quien le debe a la empresa. Vista para el personal del banco. */
  async listDebtors(companyId: number) {
    const company = await this.findCompany(companyId);

    const bills = await this.billRepository.find({
      where: { company: { id: company.id }, status: BillStatus.PENDIENTE },
      order: { vencimiento: 'ASC' },
    });

    return bills.map((bill) => ({
      numeroCliente: bill.numeroCliente,
      importe: Number(bill.importe),
      vencimiento: bill.vencimiento,
      estado: bill.status,
      vencida: new Date(bill.vencimiento) < new Date(),
    }));
  }

  /**
   * Alta de una factura. No esta en el estandar, pero sin esto la unica forma
   * de que exista una deuda es insertarla a mano en la base.
   */
  async createBill(
    companyId: number,
    data: { numeroCliente: string; importe: number; vencimiento: string },
  ) {
    const company = await this.findCompany(companyId);
    const importe = Number(data.importe);

    if (!data.numeroCliente) {
      throw new BadRequestException('Falta el numeroCliente');
    }

    if (!Number.isFinite(importe) || importe <= 0) {
      throw new BadRequestException('El importe debe ser mayor a cero');
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.vencimiento ?? ''))) {
      throw new BadRequestException(
        'El vencimiento debe tener formato YYYY-MM-DD',
      );
    }

    const bill = await this.billRepository.save(
      this.billRepository.create({
        numeroCliente: data.numeroCliente,
        importe,
        vencimiento: data.vencimiento,
        status: BillStatus.PENDIENTE,
        company,
      }),
    );

    return {
      id: bill.id,
      empresa: company.nombre,
      numeroCliente: bill.numeroCliente,
      importe: Number(bill.importe),
      vencimiento: bill.vencimiento,
      estado: bill.status,
    };
  }
}
