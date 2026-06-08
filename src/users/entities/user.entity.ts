import { Entity, PrimaryColumn, Column, OneToOne } from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  GERENTE = 'gerente',
}

@Entity('users')
export class User {
  @PrimaryColumn()
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  fullName: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @OneToOne(() => Account, (account) => account.user)
  account: Account;
}
