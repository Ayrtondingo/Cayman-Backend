import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum TopupStatus {
  APROBADA = 'aprobada',
  RECHAZADA = 'rechazada',
}

/** Recarga de saldo prepago. Simulacion propia: no hay API real de las telcos. */
@Entity('topups')
export class Topup {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  operadora: string;

  @Column()
  numero: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'enum', enum: TopupStatus })
  status: TopupStatus;

  @Column({ nullable: true })
  motivo: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
