import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Loan } from './loan.entity';

export enum InstallmentStatus {
  PENDIENTE = 'pendiente',
  PAGADA = 'pagada',
}

/** Una fila de la tabla de amortizacion. */
@Entity('loan_installments')
@Unique('UQ_installment_loan_number', ['loan', 'number'])
export class LoanInstallment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  number: number;

  /** Parte de la cuota que amortiza capital. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  principal: number;

  /** Parte de la cuota que es interes. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  interest: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total: number;

  /** Capital que queda por amortizar despues de pagar esta cuota. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  remainingPrincipal: number;

  @Column({ type: 'date' })
  dueDate: string;

  @Column({
    type: 'enum',
    enum: InstallmentStatus,
    default: InstallmentStatus.PENDIENTE,
  })
  status: InstallmentStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @ManyToOne(() => Loan, (loan) => loan.installments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;
}
