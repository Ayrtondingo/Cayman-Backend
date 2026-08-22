import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TopupsService } from './topups.service';
import { TopupsController } from './topups.controller';
import { Topup } from './entities/topup.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Topup, Account, User, Transaction])],
  controllers: [TopupsController],
  providers: [TopupsService],
  exports: [TopupsService],
})
export class TopupsModule {}
