import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Currency } from '../../common/enums/currency.enum';

// Una persona tiene como maximo una caja de ahorro por moneda en este banco,
// igual que en el Banco Central: mismo DNI + misma moneda => misma cuenta.
@Entity('accounts')
@Unique('UQ_account_user_currency', ['user', 'currency'])
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  // CBU de 22 digitos que asigna el Banco Central. Queda null hasta que
  // el cliente se sincroniza; postgres permite varios null en una columna unique.
  @Column({ nullable: true, unique: true })
  cbu: string;

  @Column({ nullable: true, unique: true })
  alias: string;

  @Column({ type: 'enum', enum: Currency, default: Currency.ARS })
  currency: Currency;

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  balance: number;

  @ManyToOne(() => User, (user) => user.accounts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @OneToMany(() => Transaction, (transaction) => transaction.account)
  transactions: Transaction[];
}
