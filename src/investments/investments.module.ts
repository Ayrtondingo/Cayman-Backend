import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvestmentsService } from './investments.service';
import { InvestmentsController } from './investments.controller';
import { FixedTerm } from './entities/fixed-term.entity';
import { CedearOrder } from './entities/cedear-order.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FixedTerm,
      CedearOrder,
      Account,
      User,
      Transaction,
    ]),
    MarketModule,
  ],
  controllers: [InvestmentsController],
  providers: [InvestmentsService],
  exports: [InvestmentsService],
})
export class InvestmentsModule {}
