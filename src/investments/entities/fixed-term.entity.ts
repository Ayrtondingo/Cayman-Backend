import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum FixedTermType {
  TRADICIONAL = 'tradicional',
  UVA = 'uva',
}

export enum FixedTermStatus {
  VIGENTE = 'vigente',
  VENCIDO = 'vencido',
  ACREDITADO = 'acreditado',
}

@Entity('fixed_terms')
export class FixedTerm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  capital: number;

  @Column({ type: 'int' })
  termDays: number;

  /** Tasa nominal anual en tanto por uno (0.30 = 30%). */
  @Column({ type: 'decimal', precision: 6, scale: 4 })
  tna: number;

  @Column({
    type: 'enum',
    enum: FixedTermType,
    default: FixedTermType.TRADICIONAL,
  })
  type: FixedTermType;

  /**
   * Valor de la UVA el dia del alta. Solo en plazos UVA: el capital se ajusta
   * por la variacion de este indice, asi que hay que congelarlo al constituir.
   */
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  uvaAtStart: number | null;

  @Column({ type: 'date' })
  maturityDate: string;

  @Column({
    type: 'enum',
    enum: FixedTermStatus,
    default: FixedTermStatus.VIGENTE,
  })
  status: FixedTermStatus;

  /** Caja de ahorro de la que salio el capital y donde se acredita al vencer. */
  @Column()
  cbu: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
