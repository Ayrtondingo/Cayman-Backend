// src/transactions/transactions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import { TransactionsController } from './transactions.controller';
import { Transaction } from './entities/transaction.entity';
import { Account } from '../accounts/entities/account.entity';
import { TransferContact } from './entities/contact.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module'; // Necesario por el UsersService
import { CentralBankModule } from '../central-bank/central-bank.module'; // <-- AGREGÁ ESTO

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Account, TransferContact, User]),
    UsersModule, // Importamos para que Transactions pueda usar UsersService
    CentralBankModule, // <-- IMPORTANTE: Ahora Transactions puede usar CentralBankService
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
