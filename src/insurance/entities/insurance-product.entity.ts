import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('insurance_products')
export class InsuranceProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  nombre: string;

  @Column()
  tipo: string;

  /**
   * Tasa anual sobre la suma asegurada, en tanto por uno.
   * Es el parametro que diferencia el precio de un producto del de otro.
   */
  @Column({ type: 'decimal', precision: 8, scale: 6 })
  tasaBase: number;
}
