import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CentralBankService } from './central-bank.service';
import { CentralBankController } from './central-bank.controller';
import { User } from '../users/entities/user.entity';

@Module({
  // El RolesGuard del controller resuelve el rol contra la tabla de usuarios.
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [CentralBankController],
  providers: [CentralBankService],
  exports: [CentralBankService], // Lo exportamos para usarlo en Users
})
export class CentralBankModule {}
