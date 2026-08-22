import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { UtilityBill } from './utility-bill.entity';

/** Empresa de servicios (luz, gas, agua, internet...). Catalogo propio del banco. */
@Entity('utility_companies')
export class UtilityCompany {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  nombre: string;

  @Column()
  rubro: string;

  @OneToMany(() => UtilityBill, (bill) => bill.company)
  bills: UtilityBill[];
}
