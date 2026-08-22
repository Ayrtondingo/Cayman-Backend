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
  VIGENTE = 'vigente',
  CANCELADO = 'cancelado',
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

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => LoanInstallment, (installment) => installment.loan)
  installments: LoanInstallment[];

  @CreateDateColumn()
  createdAt: Date;
}
