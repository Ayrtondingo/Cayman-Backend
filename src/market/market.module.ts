import { Module } from '@nestjs/common';
import { DolarService } from './dolar.service';
import { RatesService } from './rates.service';
import { MarketController } from './market.controller';

@Module({
  controllers: [MarketController],
  providers: [DolarService, RatesService],
  exports: [DolarService, RatesService],
})
export class MarketModule {}
