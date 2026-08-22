import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoansService } from './loans.service';
import { LoansController } from './loans.controller';
import { Loan } from './entities/loan.entity';
import { LoanInstallment } from './entities/loan-installment.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { MarketModule } from '../market/market.module';
import { CentralBankModule } from '../central-bank/central-bank.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Loan,
      LoanInstallment,
      Account,
      User,
      Transaction,
    ]),
    MarketModule,
    CentralBankModule,
  ],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
