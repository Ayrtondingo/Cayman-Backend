import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum OrderType {
  COMPRA = 'compra',
  VENTA = 'venta',
}

/** Una orden ejecutada de compra o venta de CEDEARs. */
@Entity('cedear_orders')
@Index(['user', 'ticker'])
export class CedearOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  ticker: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'enum', enum: OrderType })
  type: OrderType;

  /** Precio unitario en pesos al que se ejecuto. */
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
