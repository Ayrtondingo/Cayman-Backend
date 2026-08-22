import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { UsersService } from '../users/users.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { Currency } from '../common/enums/currency.enum';

/** La caja en pesos es la cuenta principal del cliente. */
const primaryOf = (accounts?: Account[]) =>
  accounts?.find((account) => account.currency === Currency.ARS) ?? null;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly usersService: UsersService,
  ) {}

  async getAllUsers() {
    const users = await this.userRepository.find({ relations: ['accounts'] });
    return users.map((u) => {
      const primary = primaryOf(u.accounts);
      return {
        id: u.id,
        fullName: u.fullName,
        email: u.email,
        dni: u.dni,
        role: u.role,
        balance: primary?.balance ?? 0,
        cbu: primary?.cbu ?? null,
        // Alias de `cbu`. Se mantiene mientras el frontend siga leyendo este campo.
        accountNumber: primary?.cbu ?? null,
        alias: primary?.alias ?? null,
        accounts: (u.accounts ?? []).map((account) => ({
          cbu: account.cbu,
          alias: account.alias,
          currency: account.currency,
          balance: Number(account.balance),
        })),
      };
    });
  }

  async adjustBalance(
    targetUserId: string,
    amount: number,
    currency: Currency = Currency.ARS,
  ) {
    const account = await this.accountRepository.findOne({
      where: { user: { id: targetUserId }, currency },
    });
    if (!account) throw new NotFoundException('Usuario o cuenta no encontrada');

    account.balance = Number(account.balance) + amount;
    await this.accountRepository.save(account);
    return { balance: Number(account.balance), currency: account.currency };
  }

  async changeRole(
    requesterId: string,
    targetUserId: string,
    newRole: UserRole,
  ) {
    const requester = await this.userRepository.findOne({
      where: { id: requesterId },
    });
    if (!requester || requester.role !== UserRole.GERENTE) {
      throw new ForbiddenException('Solo el gerente puede cambiar roles');
    }

    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    target.role = newRole;
    await this.userRepository.save(target);
    return { id: target.id, role: target.role };
  }

  async grantClientAccess(targetUserId: string, data: CreatePersonDto) {
    const target = await this.userRepository.findOne({
      where: { id: targetUserId },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    return this.usersService.syncWithCentralBank(targetUserId, data);
  }
}
