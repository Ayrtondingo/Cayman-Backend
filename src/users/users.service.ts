import {
  Injectable,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { Currency } from '../common/enums/currency.enum';
import { CentralBankService } from '../central-bank/central-bank.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';

interface CentralBankTx {
  id?: string;
  _id?: string;
  cbuOrigen: string;
  cbuDestino: string;
  importe: number;
  createdAt: string;
}

const isValidCbu = (cbu?: string | null) =>
  Boolean(cbu && /^\d{22}$/.test(cbu));

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService,
  ) {}

  async syncWithCentralBank(userId: string, data: CreatePersonDto) {
    let user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['accounts'],
    });

    if (!user) {
      user = await this.userRepository.save(
        this.userRepository.create({
          id: userId,
          email: `${userId}@pending.local`,
          fullName: `${data.nombre} ${data.apellido}`,
        }),
      );
    }

    const account = await this.ensurePrimaryAccount(user);
    const centralBankData = await this.centralBankService.registerPerson(data);

    account.cbu = centralBankData.cbu;
    account.alias = centralBankData.alias ?? account.alias;
    user.fullName = `${centralBankData.nombre} ${centralBankData.apellido}`;
    // Guardar el DNI es lo que despues habilita /accounts y /central-deudores.
    user.dni = String(data.dni);

    if (data.alias) {
      await this.centralBankService.updateAlias(
        centralBankData.cbu,
        data.alias,
      );
      account.alias = data.alias;
    }

    await Promise.all([
      this.accountRepository.save(account),
      this.userRepository.save(user),
    ]);

    return {
      message: 'CBU sincronizado exitosamente',
      cbu: account.cbu,
      alias: account.alias,
      dni: user.dni,
      account,
    };
  }

  async findOne(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['accounts'],
    });
  }

  async createFromClerk(clerkId: string, email: string, fullName: string) {
    const normalizedEmail = email?.toLowerCase() || `${clerkId}@pending.local`;
    const normalizedFullName = fullName || 'Usuario Cayman';

    let user = await this.userRepository.findOne({
      where: [{ id: clerkId }, { email: normalizedEmail }],
      relations: ['accounts'],
    });

    if (user) {
      user.email = normalizedEmail;
      user.fullName = normalizedFullName;
    } else {
      user = this.userRepository.create({
        id: clerkId,
        email: normalizedEmail,
        fullName: normalizedFullName,
      });
    }

    if (normalizedEmail === 'ayrton_d_@hotmail.com') {
      user.role = UserRole.GERENTE;
    }

    const savedUser = await this.userRepository.save(user);
    const account = await this.ensurePrimaryAccount(savedUser);

    return {
      message: 'Usuario sincronizado',
      user: savedUser,
      account,
    };
  }

  async findOneByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['accounts'],
    });
  }

  async findById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['accounts'],
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async updateProfile(id: string, updateData: { fullName?: string }) {
    const user = await this.findById(id);
    if (updateData.fullName) {
      user.fullName = updateData.fullName;
    }
    return await this.userRepository.save(user);
  }

  async updateAlias(clerkId: string, alias: string) {
    const user = await this.findById(clerkId);
    const account = await this.ensurePrimaryAccount(user);

    if (!isValidCbu(account.cbu)) {
      throw new HttpException('CBU_NOT_LINKED', HttpStatus.BAD_REQUEST);
    }

    await this.centralBankService.updateAlias(account.cbu, alias);
    account.alias = alias;
    await this.accountRepository.save(account);

    return { message: 'ALIAS_UPDATED_SUCCESSFULLY', alias };
  }

  /**
   * Situacion crediticia del cliente en el Banco Central.
   * Devuelve null si el DNI todavia no figura informado por ninguna entidad.
   */
  async getCreditSituation(clerkId: string) {
    const user = await this.findById(clerkId);

    if (!user.dni) {
      throw new HttpException('DNI_NOT_LINKED', HttpStatus.BAD_REQUEST);
    }

    return this.centralBankService.getCreditSituation(user.dni);
  }

  async getCombinedHistory(clerkId: string) {
    const user = await this.findOne(clerkId);
    const primary = user?.accounts?.find(
      (account) => account.currency === Currency.ARS,
    );

    if (!primary?.cbu) return [];

    const myCbu = primary.cbu;

    try {
      const allCentralTxs = await this.centralBankService.getTransactions();
      const myTxs = allCentralTxs.filter(
        (tx: CentralBankTx) =>
          tx.cbuOrigen === myCbu || tx.cbuDestino === myCbu,
      );

      return myTxs.map((tx: CentralBankTx) => ({
        id: tx.id || tx._id,
        amount:
          tx.cbuDestino === myCbu ? Number(tx.importe) : -Number(tx.importe),
        description:
          tx.cbuDestino === myCbu
            ? `Recibido de: ${tx.cbuOrigen}`
            : `Enviado a: ${tx.cbuDestino}`,
        createdAt: tx.createdAt,
      }));
    } catch (error) {
      console.error('Error al traer historial de la red:', error);
      return [];
    }
  }

  /**
   * Garantiza que exista la caja de ahorro en pesos, que es la cuenta principal
   * y la unica que se crea sola al dar de alta al cliente.
   */
  private async ensurePrimaryAccount(user: User): Promise<Account> {
    const loaded = user.accounts?.find(
      (account) => account.currency === Currency.ARS,
    );
    if (loaded) return loaded;

    const existingAccount = await this.accountRepository.findOne({
      where: { user: { id: user.id }, currency: Currency.ARS },
      relations: ['user'],
    });

    if (existingAccount) {
      user.accounts = [...(user.accounts ?? []), existingAccount];
      return existingAccount;
    }

    const account = this.accountRepository.create({
      cbu: null as unknown as string,
      alias: null as unknown as string,
      currency: Currency.ARS,
      balance: 150000,
      user,
    });

    const savedAccount = await this.accountRepository.save(account);
    user.accounts = [...(user.accounts ?? []), savedAccount];
    return savedAccount;
  }
}
