import { Entity, PrimaryColumn, Column, OneToOne } from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';

@Entity('users')
export class User {
  @PrimaryColumn()
  id: string; // Aquí guardamos el 'user_2...' de Clerk

  @Column({ unique: true })
  email: string;

  @Column()
  fullName: string;

  @OneToOne(() => Account, (account) => account.user)
  account: Account;
}