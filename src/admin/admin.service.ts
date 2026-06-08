import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { Account } from '../accounts/entities/account.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async getAllUsers() {
    const users = await this.userRepository.find({ relations: ['account'] });
    return users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      balance: u.account?.balance ?? 0,
      accountNumber: u.account?.accountNumber ?? null,
      alias: u.account?.alias ?? null,
    }));
  }

  async adjustBalance(targetUserId: string, amount: number) {
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
      relations: ['account'],
    });
    if (!user || !user.account) throw new NotFoundException('Usuario o cuenta no encontrada');

    user.account.balance = Number(user.account.balance) + amount;
    await this.accountRepository.save(user.account);
    return { balance: user.account.balance };
  }

  async changeRole(requesterId: string, targetUserId: string, newRole: UserRole) {
    const requester = await this.userRepository.findOne({ where: { id: requesterId } });
    if (!requester || requester.role !== UserRole.GERENTE) {
      throw new ForbiddenException('Solo el gerente puede cambiar roles');
    }

    const target = await this.userRepository.findOne({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('Usuario no encontrado');

    target.role = newRole;
    await this.userRepository.save(target);
    return { id: target.id, role: target.role };
  }
}
