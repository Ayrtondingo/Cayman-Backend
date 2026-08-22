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
import { LoanInstallment } from './loan-installment.entity';

export enum LoanStatus {
  /** Esperando que el gerente lo apruebe o lo rechace. Sin plata acreditada. */
  PENDIENTE = 'pendiente',
  VIGENTE = 'vigente',
  CANCELADO = 'cancelado',
  RECHAZADO = 'rechazado',
}

/** Respuesta de la central de deudores en el momento de la solicitud. */
export interface InformeCentral {
  situacion: number;
  deudas: { entidad: string; monto: number; situacion: number }[];
}

@Entity('loans')
export class Loan {
  @PrimaryGeneratedColumn()
  id: number;

  /** Capital prestado. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int' })
  termMonths: number;

  /** Tasa nominal anual en tanto por uno (0.75 = 75%). */
  @Column({ type: 'decimal', precision: 6, scale: 4 })
  tna: number;

  /** Cuota fija del sistema frances. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  installmentAmount: number;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.VIGENTE })
  status: LoanStatus;

  /** Caja de ahorro donde se acredito el capital y de donde se cobran las cuotas. */
  @Column()
  cbu: string;

  /**
   * Por que la solicitud quedo a revision. Null si salio derecho.
   * Es lo que el gerente lee para decidir.
   */
  @Column({ type: 'varchar', nullable: true })
  motivoRevision: string | null;

  /**
   * Foto de la central de deudores al momento de solicitar. Se guarda y no se
   * vuelve a consultar: el gerente tiene que decidir sobre lo que se vio
   * cuando se pidio, no sobre un estado que cambio despues.
   */
  @Column({ type: 'jsonb', nullable: true })
  informeCentral: InformeCentral | null;

  /** Gerente que resolvio la solicitud. */
  @Column({ type: 'varchar', nullable: true })
  resueltoPor: string | null;

  @Column({ type: 'timestamp', nullable: true })
  resueltoEl: Date | null;

  @Column({ type: 'varchar', nullable: true })
  motivoRechazo: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => LoanInstallment, (installment) => installment.loan)
  installments: LoanInstallment[];

  @CreateDateColumn()
  createdAt: Date;
}
