import { Module } from '@nestjs/common';
import { CentralBankService } from './central-bank.service';

@Module({
  providers: [CentralBankService],
  exports: [CentralBankService], // Lo exportamos para usarlo en Users
})
export class CentralBankModule {}