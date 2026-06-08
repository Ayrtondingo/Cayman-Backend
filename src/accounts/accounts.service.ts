import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
  ) {}

  async getBalance(clerkId: string) {
    if (!clerkId) {
      return { balance: 0, fullName: 'No autenticado', accountNumber: 'N/A' };
    }

    const account = await this.accountRepository.findOne({
      where: { 
        user: { id: clerkId } // Buscamos por la relación
      },
      relations: ['user'],
    });

    if (!account) {
      return { balance: 0, fullName: 'Sin cuenta vinculada', accountNumber: 'N/A' };
    }

    return {
      balance: Number(account.balance),
      fullName: account.user?.fullName,
      accountNumber: account.accountNumber,
    };
  }
}