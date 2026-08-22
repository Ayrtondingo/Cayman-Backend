import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { Account } from './entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CentralBankModule } from '../central-bank/central-bank.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, User, Transaction]),
    CentralBankModule,
    MarketModule,
  ],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
