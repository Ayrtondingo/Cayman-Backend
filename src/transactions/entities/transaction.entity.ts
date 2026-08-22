import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
}

/**
 * Categoria del movimiento, para agrupar en el resumen de gastos.
 * El tipo (DEPOSIT/WITHDRAWAL) dice si entra o sale plata; la categoria dice por que.
 */
export enum TransactionCategory {
  TRANSFERENCIA = 'transferencia',
  DEPOSITO = 'deposito',
  EXTRACCION = 'extraccion',
  CAMBIO_DIVISAS = 'cambio_divisas',
  TARJETA = 'tarjeta',
  PRESTAMO = 'prestamo',
  SERVICIOS = 'servicios',
  RECARGA = 'recarga',
  INVERSION = 'inversion',
  SEGURO = 'seguro',
  OTROS = 'otros',
}

export enum TransactionStatus {
  APPROVED = 'aprobada',
  REJECTED = 'rechazada',
  LOCAL = 'local',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true, unique: true })
  externalTransactionId: string;

  @Column({ nullable: true })
  counterpartyCbu: string;

  @Column({ nullable: true })
  counterpartyName: string;

  @Column({
    type: 'enum',
    enum: TransactionCategory,
    default: TransactionCategory.OTROS,
  })
  category: TransactionCategory;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.LOCAL,
  })
  status: TransactionStatus;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Account, (account) => account.transactions)
  account: Account;
}
