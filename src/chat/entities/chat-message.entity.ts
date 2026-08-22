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

export enum ChatRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

/** Historial de la conversacion con el asistente, para darle contexto entre mensajes. */
@Entity('chat_messages')
@Index(['user', 'createdAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ChatRole })
  role: ChatRole;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
