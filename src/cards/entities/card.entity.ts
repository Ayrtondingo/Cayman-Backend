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
import { CardAuthorization } from './card-authorization.entity';

export enum CardType {
  DEBITO = 'debito',
  CREDITO = 'credito',
}

export enum CardStatus {
  ACTIVA = 'activa',
  BLOQUEADA = 'bloqueada',
}

@Entity('cards')
export class Card {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: CardType })
  type: CardType;

  // Numero completo de 16 digitos. Nunca sale del backend sin enmascarar.
  @Column({ unique: true })
  number: string;

  // Codigo de seguridad de 3 digitos. Se genera al emitir y solo se muestra
  // cuando el titular pide ver los datos completos.
  @Column({ length: 3 })
  cvv: string;

  // Solo en debito: la caja de ahorro de la que se descuentan los consumos.
  @Column({ nullable: true })
  cbuAsociado: string;

  // Solo en credito: tope de consumo del periodo.
  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  limite: number | null;

  @Column({ type: 'enum', enum: CardStatus, default: CardStatus.ACTIVA })
  status: CardStatus;

  @Column({ type: 'date' })
  expiresAt: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => CardAuthorization, (authorization) => authorization.card)
  authorizations: CardAuthorization[];

  @CreateDateColumn()
  createdAt: Date;
}
