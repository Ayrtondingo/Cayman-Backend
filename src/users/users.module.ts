// src/users/users.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { Account } from '../accounts/entities/account.entity';
import { CentralBankModule } from '../central-bank/central-bank.module'; // <-- IMPORTANTE

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Account]),
    CentralBankModule, // <-- Sin esto, Nest no encontrará el CentralBankService
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}