import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Currency } from '../../common/enums/currency.enum';

/**
 * Destinatario al que el cliente ya le transfirio.
 *
 * Se guarda solo al completarse una transferencia: la agenda se arma sola, sin
 * que nadie tenga que cargar contactos a mano. La clave es el CBU, que es lo
 * unico estable: el alias lo puede cambiar el titular en cualquier momento.
 */
@Entity('transfer_contacts')
@Unique('UQ_contact_user_cbu', ['user', 'cbu'])
@Index(['user', 'ultimoUso'])
export class TransferContact {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  cbu: string;

  /** Alias del destinatario la ultima vez que se le transfirio. */
  @Column({ type: 'varchar', nullable: true })
  alias: string | null;

  /** Titular, segun el Banco Central. */
  @Column({ type: 'varchar', nullable: true })
  nombre: string | null;

  /** Nombre que le puso el cliente. Le gana al del Banco Central al mostrar. */
  @Column({ type: 'varchar', nullable: true })
  apodo: string | null;

  /** Codigo de entidad del banco destino, para mostrar de que banco es. */
  @Column({ type: 'int', nullable: true })
  bankCode: number | null;

  @Column({ type: 'enum', enum: Currency, default: Currency.ARS })
  currency: Currency;

  @Column({ type: 'int', default: 0 })
  vecesUsado: number;

  @Column({ type: 'timestamp', nullable: true })
  ultimoUso: Date | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
