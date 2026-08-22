import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatMessage } from './entities/chat-message.entity';
import { Escalation } from './entities/escalation.entity';
import { User } from '../users/entities/user.entity';
import { AccountsModule } from '../accounts/accounts.module';
import { CardsModule } from '../cards/cards.module';
import { LoansModule } from '../loans/loans.module';
import { ReportsModule } from '../reports/reports.module';
import { MarketModule } from '../market/market.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessage, Escalation, User]),
    AccountsModule,
    CardsModule,
    LoansModule,
    ReportsModule,
    MarketModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
