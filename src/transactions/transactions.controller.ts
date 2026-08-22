import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { Currency } from '../common/enums/currency.enum';

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
      moneda?: string;
    },
  ) {
    const userId = req.user.id;
    // Acepta alias, CBU o cualquier combinación de nombres de campo
    const destinatario =
      body.destinatario ?? body.alias ?? body.cbuDestino ?? body.destinationCbu;
    const amount = Number(body.monto ?? body.amount);

    // Sin moneda se asume pesos, que es la caja que todo cliente tiene.
    const moneda = String(body.moneda ?? Currency.ARS).toUpperCase() as Currency;

    if (!Object.values(Currency).includes(moneda)) {
      throw new BadRequestException(
        `Moneda no soportada. Valores validos: ${Object.values(Currency).join(', ')}`,
      );
    }

    return this.transactionsService.createTransfer(
      userId,
      destinatario,
      amount,
      body.motivo,
      moneda,
    );
  }

  /** Historial de la caja en la moneda pedida. Por defecto, pesos. */
  @Get('history/:moneda')
  async getHistoryByCurrency(@Request() req, @Param('moneda') moneda: string) {
    const currency = String(moneda).toUpperCase() as Currency;

    if (!Object.values(Currency).includes(currency)) {
      throw new BadRequestException('Moneda no soportada');
    }

    return this.transactionsService.getCombinedHistory(req.user.id, currency);
  }

  @Get('history')
  async getHistory(@Request() req) {
    return this.transactionsService.getCombinedHistory(req.user.id);
  }
}
