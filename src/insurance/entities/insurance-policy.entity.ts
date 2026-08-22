import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { InsuranceProduct } from './insurance-product.entity';
import { InsuranceClaim } from './insurance-claim.entity';

export enum PolicyStatus {
  VIGENTE = 'vigente',
  CANCELADA = 'cancelada',
}

export interface Beneficiario {
  nombre: string;
  dni: string;
  porcentaje: number;
}

@Entity('insurance_policies')
export class InsurancePolicy {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  sumaAsegurada: number;

  /** Prima mensual congelada al contratar. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  prima: number;

  /** Edad del titular al contratar, que es la que definio la prima. */
  @Column({ type: 'int' })
  edadAlContratar: number;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  beneficiarios: Beneficiario[];

  @Column({ type: 'enum', enum: PolicyStatus, default: PolicyStatus.VIGENTE })
  status: PolicyStatus;

  @ManyToOne(() => InsuranceProduct, { onDelete: 'RESTRICT', eager: true })
  @JoinColumn({ name: 'productId' })
  product: InsuranceProduct;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => InsuranceClaim, (claim) => claim.policy)
  claims: InsuranceClaim[];

  @CreateDateColumn()
  createdAt: Date;
}
