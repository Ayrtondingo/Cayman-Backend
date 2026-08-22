import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { InsurancePolicy } from './insurance-policy.entity';

export enum ClaimStatus {
  EN_ANALISIS = 'en_analisis',
  APROBADO = 'aprobado',
  RECHAZADO = 'rechazado',
}

/** Denuncia de siniestro sobre una poliza. */
@Entity('insurance_claims')
export class InsuranceClaim {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  descripcion: string;

  @Column({ type: 'enum', enum: ClaimStatus, default: ClaimStatus.EN_ANALISIS })
  status: ClaimStatus;

  @ManyToOne(() => InsurancePolicy, (policy) => policy.claims, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'policyId' })
  policy: InsurancePolicy;

  @CreateDateColumn()
  createdAt: Date;
}
