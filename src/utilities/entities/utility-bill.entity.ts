import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UtilityCompany } from './utility-company.entity';

export enum BillStatus {
  PENDIENTE = 'pendiente',
  PAGADA = 'pagada',
}

/** Una factura de un cliente de la empresa de servicios. */
@Entity('utility_bills')
@Index(['company', 'numeroCliente'])
export class UtilityBill {
  @PrimaryGeneratedColumn()
  id: number;

  /** Identificador del cliente ante la empresa, no ante el banco. */
  @Column()
  numeroCliente: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  importe: number;

  @Column({ type: 'date' })
  vencimiento: string;

  @Column({ type: 'enum', enum: BillStatus, default: BillStatus.PENDIENTE })
  status: BillStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt: Date | null;

  /** Quien la pago, si se pago desde este banco. */
  @Column({ nullable: true })
  paidByUserId: string | null;

  @ManyToOne(() => UtilityCompany, (company) => company.bills, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'companyId' })
  company: UtilityCompany;
}
