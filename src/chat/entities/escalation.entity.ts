import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum EscalationStatus {
  PENDIENTE = 'pendiente',
  EN_CURSO = 'en_curso',
  RESUELTA = 'resuelta',
}

/** Derivacion de la conversacion a un humano. */
@Entity('chat_escalations')
export class Escalation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  motivo: string;

  @Column({ type: 'enum', enum: EscalationStatus, default: EscalationStatus.PENDIENTE })
  status: EscalationStatus;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
