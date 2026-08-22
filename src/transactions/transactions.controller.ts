import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('transactions')
@UseGuards(ClerkAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('transfer')
  async transfer(
    @Request() req,
    @Body()
    body: {
      destinatario?: string;
      alias?: string;
      cbuDestino?: string;
      destinationCbu?: string;
      monto?: number;
      amount?: number;
      motivo?: string;
    },
  ) {
    const userId = req.user.id;
    // Acepta alias, CBU o cualquier combinación de nombres de campo
    const destinatario =
      body.destinatario ?? body.alias ?? body.cbuDestino ?? body.destinationCbu;
    const amount = Number(body.monto ?? body.amount);

    return this.transactionsService.createTransfer(
      userId,
      destinatario,
      amount,
      body.motivo,
    );
  }

  @Get('history')
  async getHistory(@Request() req) {
    return this.transactionsService.getCombinedHistory(req.user.id);
  }
}
