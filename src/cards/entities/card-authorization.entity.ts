import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Card } from './card.entity';

export enum AuthorizationStatus {
  APROBADA = 'aprobada',
  RECHAZADA = 'rechazada',
}

/** Un intento de consumo con la tarjeta, aprobado o rechazado. */
@Entity('card_authorizations')
export class CardAuthorization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  comercio: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ type: 'int', default: 1 })
  cuotas: number;

  @Column({ type: 'enum', enum: AuthorizationStatus })
  status: AuthorizationStatus;

  // Por que se rechazo. Null si se aprobo.
  @Column({ nullable: true })
  motivo: string | null;

  @ManyToOne(() => Card, (card) => card.authorizations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cardId' })
  card: Card;

  @CreateDateColumn()
  createdAt: Date;
}
