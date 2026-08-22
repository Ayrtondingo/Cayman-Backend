import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
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

  // El Banco Central indexa personas, cuentas y deudas por DNI, asi que sin
  // esto no se puede llamar a /accounts ni a /central-deudores.
  @Column({ type: 'varchar', nullable: true, unique: true })
  dni: string | null;

  // La prima de un seguro depende de la edad, asi que hace falta la fecha de nacimiento.
  @Column({ type: 'date', nullable: true })
  birthDate: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  // Una cuenta por moneda (ARS y USD), no una sola como antes.
  @OneToMany(() => Account, (account) => account.user)
  accounts: Account[];
}
