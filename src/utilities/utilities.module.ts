import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UtilitiesService } from './utilities.service';
import { UtilitiesController } from './utilities.controller';
import { UtilityCompany } from './entities/utility-company.entity';
import { UtilityBill } from './entities/utility-bill.entity';
import { ServiceSubscription } from './entities/service-subscription.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UtilityCompany,
      UtilityBill,
      ServiceSubscription,
      Account,
      User,
      Transaction,
    ]),
  ],
  controllers: [UtilitiesController],
  providers: [UtilitiesService],
  exports: [UtilitiesService],
})
export class UtilitiesModule {}
