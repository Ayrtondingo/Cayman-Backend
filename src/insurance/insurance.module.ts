import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsuranceService } from './insurance.service';
import { InsuranceController } from './insurance.controller';
import { InsuranceProduct } from './entities/insurance-product.entity';
import { InsurancePolicy } from './entities/insurance-policy.entity';
import { InsuranceClaim } from './entities/insurance-claim.entity';
import { Account } from '../accounts/entities/account.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InsuranceProduct,
      InsurancePolicy,
      InsuranceClaim,
      Account,
      User,
      Transaction,
    ]),
  ],
  controllers: [InsuranceController],
  providers: [InsuranceService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
