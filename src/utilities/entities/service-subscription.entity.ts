import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { UtilityCompany } from './utility-company.entity';

/**
 * Servicio adherido por un cliente.
 *
 * Guarda el numero de cliente que la persona tiene ante la empresa, para que
 * no tenga que recordarlo cada vez. Sin esto, la unica forma de ver una
 * factura es tipear el numero a mano.
 */
@Entity('service_subscriptions')
@Unique('UQ_subscription_user_company', ['user', 'company'])
export class ServiceSubscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  numeroCliente: string;

  /** Nombre que le pone el cliente, para distinguir "casa" de "depto". */
  @Column({ nullable: true })
  apodo: string | null;

  @ManyToOne(() => UtilityCompany, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'companyId' })
  company: UtilityCompany;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;
}
