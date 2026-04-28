import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankService } from '../central-bank/central-bank.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(Account)
    private readonly accountRepository: Repository<Account>,
    private readonly centralBankService: CentralBankService,
  ) {}

  // Este nombre debe ser el mismo que usa el Controller
  async createTransfer(clerkId: string, receiverCbu: string, amount: number) {
    if (amount <= 0) throw new BadRequestException('El monto debe ser mayor a cero');

    const senderAccount = await this.accountRepository.findOne({
      where: { user: { id: clerkId } },
      relations: ['user'],
    });

    if (!senderAccount) throw new NotFoundException('Cuenta emisora no encontrada');
    if (senderAccount.balance < amount) throw new BadRequestException('Saldo insuficiente');

    try {
      // Llamada al banco central
      await this.centralBankService.registerTransaction({
        cbuOrigen: senderAccount.accountNumber,
        cbuDestino: receiverCbu,
        importe: amount,
        saldoOrigen: senderAccount.balance,
      });

      // Lógica local
      senderAccount.balance -= amount;
      await this.accountRepository.save(senderAccount);

      const transaction = this.transactionRepository.create({
        amount: -amount,
        description: `Transferencia a CBU: ${receiverCbu}`,
        account: senderAccount,
      });

      return await this.transactionRepository.save(transaction);
    } catch (error: any) {
      throw new BadRequestException(error.response?.data?.error || 'Error en Red Central');
    }
  }

  // Este nombre debe ser el mismo que usa el Controller
  async getLocalHistory(clerkId: string) {
    return await this.transactionRepository.find({
      where: { account: { user: { id: clerkId } } },
      order: { createdAt: 'DESC' },
    });
  }
}