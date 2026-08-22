import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InsuranceProduct } from './entities/insurance-product.entity';
import {
  Beneficiario,
  InsurancePolicy,
  PolicyStatus,
} from './entities/insurance-policy.entity';
import { ClaimStatus, InsuranceClaim } from './entities/insurance-claim.entity';
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

/** Catalogo inicial. Las tasas son anuales sobre la suma asegurada. */
const CATALOGO_INICIAL = [
  { nombre: 'Seguro de Vida', tipo: 'vida', tasaBase: 0.0045 },
  { nombre: 'Accidentes Personales', tipo: 'accidentes', tasaBase: 0.0028 },
  { nombre: 'Seguro de Hogar', tipo: 'hogar', tasaBase: 0.0035 },
  { nombre: 'Robo en Cajero', tipo: 'robo', tasaBase: 0.0012 },
];

const EDAD_MINIMA = 18;
const EDAD_MAXIMA = 75;

/**
 * Recargo por edad: la prima crece 3% por cada anio por encima de los 30.
 * Formula simplificada a proposito; no hace falta una tabla actuarial real.
 */
const EDAD_BASE = 30;
const RECARGO_POR_ANIO = 0.03;

@Injectable()
export class InsuranceService implements OnModuleInit {
  private readonly logger = new Logger(InsuranceService.name);

  constructor(
    @InjectRepository(InsuranceProduct)
    private readonly productRepository: Repository<InsuranceProduct>,
    @InjectRepository(InsurancePolicy)
    private readonly policyRepository: Repository<InsurancePolicy>,
    @InjectRepository(InsuranceClaim)
    private readonly claimRepository: Repository<InsuranceClaim>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    const count = await this.productRepository.count();
    if (count > 0) return;

    await this.productRepository.save(
      CATALOGO_INICIAL.map((product) => this.productRepository.create(product)),
    );
    this.logger.log(`Catalogo de seguros sembrado: ${CATALOGO_INICIAL.length} productos`);
  }

  async listProducts() {
    const products = await this.productRepository.find({ order: { nombre: 'ASC' } });
    return products.map((product) => ({
      id: product.id,
      nombre: product.nombre,
      tipo: product.tipo,
      tasaBase: Number(product.tasaBase),
    }));
  }

  /** Edad cumplida a partir de una fecha de nacimiento YYYY-MM-DD. */
  private ageFrom(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();

    const cumpleEsteAnio =
      today.getMonth() > birth.getMonth() ||
      (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

    if (!cumpleEsteAnio) age -= 1;
    return age;
  }

  /**
   * Prima de referencia.
   *
   *   prima anual = sumaAsegurada * tasaBase * (1 + 0.03 * anios sobre 30)
   *   prima mensual = prima anual / 12
   */
  async quote(productId: number, sumaAsegurada: number, edad: number) {
    const product = await this.productRepository.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Producto de seguro no encontrado');

    const suma = Number(sumaAsegurada);

    if (!Number.isFinite(suma) || suma <= 0) {
      throw new BadRequestException('La suma asegurada debe ser mayor a cero');
    }

    if (!Number.isInteger(edad) || edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
      throw new BadRequestException(
        `La edad debe ser un entero entre ${EDAD_MINIMA} y ${EDAD_MAXIMA}`,
      );
    }

    const factorEdad = 1 + Math.max(0, edad - EDAD_BASE) * RECARGO_POR_ANIO;
    const primaAnual = round2(suma * Number(product.tasaBase) * factorEdad);

    return {
      productoId: product.id,
      producto: product.nombre,
      sumaAsegurada: suma,
      edad,
      tasaBase: Number(product.tasaBase),
      factorEdad: round2(factorEdad),
      primaAnual,
      prima: round2(primaAnual / 12),
    };
  }

  /**
   * Contrata una poliza y cobra la primera prima mensual de la caja en pesos.
   *
   * Los beneficiarios tienen que sumar 100%: una poliza que reparte 80% deja
   * un 20% sin destinatario, que es justo el problema que un seguro no puede tener.
   */
  async createPolicy(
    clerkId: string,
    data: {
      productoId: number;
      sumaAsegurada: number;
      beneficiarios?: Beneficiario[];
      edad?: number;
    },
  ) {
    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const edad = data.edad ?? (user.birthDate ? this.ageFrom(user.birthDate) : null);

    if (edad === null) {
      throw new BadRequestException(
        'No hay fecha de nacimiento cargada: enviá "edad" o completá el perfil',
      );
    }

    const beneficiarios = data.beneficiarios ?? [];

    if (!beneficiarios.length) {
      throw new BadRequestException('Hay que indicar al menos un beneficiario');
    }

    for (const beneficiario of beneficiarios) {
      if (!beneficiario.nombre || !beneficiario.dni) {
        throw new BadRequestException('Cada beneficiario necesita nombre y dni');
      }
    }

    const totalPorcentaje = beneficiarios.reduce(
      (sum, beneficiario) => sum + Number(beneficiario.porcentaje ?? 0),
      0,
    );

    if (Math.abs(totalPorcentaje - 100) > 0.01) {
      throw new BadRequestException(
        `Los beneficiarios deben sumar 100%, suman ${totalPorcentaje}%`,
      );
    }

    const cotizacion = await this.quote(data.productoId, data.sumaAsegurada, edad);
    const product = await this.productRepository.findOne({
      where: { id: data.productoId },
    });

    const account = await this.accountRepository.findOne({
      where: { user: { id: clerkId }, currency: Currency.ARS },
    });

    if (!account) throw new NotFoundException('No tenes caja de ahorro en pesos');

    if (Number(account.balance) < cotizacion.prima) {
      throw new BadRequestException(
        `Saldo insuficiente para la primera prima de ${cotizacion.prima}`,
      );
    }

    const policy = await this.dataSource.transaction(async (manager) => {
      account.balance = round2(Number(account.balance) - cotizacion.prima);
      await manager.save(Account, account);

      const saved = await manager.save(
        manager.create(InsurancePolicy, {
          sumaAsegurada: cotizacion.sumaAsegurada,
          prima: cotizacion.prima,
          edadAlContratar: edad,
          beneficiarios,
          status: PolicyStatus.VIGENTE,
          product: product!,
          user,
        }),
      );

      await manager.save(
        manager.create(Transaction, {
          amount: -cotizacion.prima,
          type: TransactionType.WITHDRAWAL,
          description: `Prima de ${product!.nombre} (poliza #${saved.id})`,
          category: TransactionCategory.SEGURO,
          status: TransactionStatus.LOCAL,
          account,
        }),
      );

      return saved;
    });

    return this.toPublicPolicy(policy);
  }

  async findPoliciesByUser(clerkId: string) {
    const policies = await this.policyRepository.find({
      where: { user: { id: clerkId } },
      order: { createdAt: 'DESC' },
    });

    return policies.map((policy) => this.toPublicPolicy(policy));
  }

  private async ownedPolicy(clerkId: string, policyId: number): Promise<InsurancePolicy> {
    const policy = await this.policyRepository.findOne({
      where: { id: policyId, user: { id: clerkId } },
    });

    if (!policy) {
      throw new NotFoundException('Poliza no encontrada o no pertenece al cliente');
    }

    return policy;
  }

  async findPolicy(clerkId: string, policyId: number) {
    return this.toPublicPolicy(await this.ownedPolicy(clerkId, policyId));
  }

  /** Denuncia de siniestro. Queda en analisis: la resolucion es manual. */
  async createClaim(clerkId: string, policyId: number, descripcion: string) {
    const policy = await this.ownedPolicy(clerkId, policyId);

    if (policy.status !== PolicyStatus.VIGENTE) {
      throw new BadRequestException('La poliza no esta vigente');
    }

    if (!descripcion) {
      throw new BadRequestException('Hay que describir el siniestro');
    }

    const claim = await this.claimRepository.save(
      this.claimRepository.create({
        descripcion,
        status: ClaimStatus.EN_ANALISIS,
        policy,
      }),
    );

    return {
      id: claim.id,
      polizaId: policy.id,
      descripcion: claim.descripcion,
      estado: claim.status,
      fechaDenuncia: claim.createdAt,
    };
  }

  async listClaims(clerkId: string, policyId: number) {
    const policy = await this.ownedPolicy(clerkId, policyId);

    const claims = await this.claimRepository.find({
      where: { policy: { id: policy.id } },
      order: { createdAt: 'DESC' },
    });

    return claims.map((claim) => ({
      id: claim.id,
      polizaId: policy.id,
      descripcion: claim.descripcion,
      estado: claim.status,
      fechaDenuncia: claim.createdAt,
    }));
  }

  private toPublicPolicy(policy: InsurancePolicy) {
    return {
      id: policy.id,
      productoId: policy.product?.id,
      producto: policy.product?.nombre,
      sumaAsegurada: Number(policy.sumaAsegurada),
      prima: Number(policy.prima),
      edadAlContratar: policy.edadAlContratar,
      beneficiarios: policy.beneficiarios,
      estado: policy.status,
      fechaAlta: policy.createdAt,
    };
  }
}
