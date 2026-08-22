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
import { AccountsService } from './accounts.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { Currency } from '../common/enums/currency.enum';

@Controller('accounts')
@UseGuards(ClerkAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  /** Saldo de la caja en pesos. Se mantiene por compatibilidad con el frontend actual. */
  @Get('balance')
  async getBalance(@Request() req) {
    return this.accountsService.getBalance(this.clerkId(req));
  }

  /** Saldos de todas las cajas de ahorro del cliente (ARS y USD). */
  @Get()
  async getAccounts(@Request() req) {
    return this.accountsService.getBalances(this.clerkId(req));
  }

  /** Abre una caja de ahorro en la moneda pedida. En la practica se usa para USD. */
  @Post()
  async openAccount(@Request() req, @Body('moneda') moneda: string) {
    const currency = String(moneda ?? '').toUpperCase() as Currency;

    if (!Object.values(Currency).includes(currency)) {
      throw new BadRequestException(
        `Moneda no soportada. Valores validos: ${Object.values(Currency).join(', ')}`,
      );
    }

    return this.accountsService.openAccount(this.clerkId(req), currency);
  }

  @Post(':cbu/depositos')
  async deposit(
    @Request() req,
    @Param('cbu') cbu: string,
    @Body('monto') monto: number,
  ) {
    return this.accountsService.deposit(this.clerkId(req), cbu, Number(monto));
  }

  @Post(':cbu/extracciones')
  async withdraw(
    @Request() req,
    @Param('cbu') cbu: string,
    @Body('monto') monto: number,
  ) {
    return this.accountsService.withdraw(this.clerkId(req), cbu, Number(monto));
  }

  @Get(':cbu/movimientos')
  async getMovements(@Request() req, @Param('cbu') cbu: string) {
    return this.accountsService.getMovements(this.clerkId(req), cbu);
  }

  /**
   * Compra o venta de dolares entre las cajas del cliente.
   * El monto va siempre en USD. No lleva CBU en la ruta porque mueve las dos cuentas.
   */
  @Post('cambio')
  async exchange(
    @Request() req,
    @Body('operacion') operacion: string,
    @Body('monto') monto: number,
  ) {
    return this.accountsService.exchange(
      this.clerkId(req),
      String(operacion ?? '').toLowerCase() as 'compra' | 'venta',
      Number(monto),
    );
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
