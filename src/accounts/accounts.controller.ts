import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @UseGuards(ClerkAuthGuard) // 1. Reactivamos la seguridad
  @Get('balance')
  async getBalance(@Request() req) {
    // 2. Extraemos el ID dinámico. 
    // Dependiendo de cómo esté hecho tu ClerkAuthGuard, el ID suele estar en:
    // req.auth.userId  O  req.user.id
    const clerkId = req.auth?.userId || req.user?.id;

    // Log de seguridad para confirmar que el Guard está enviando el ID completo
    console.log(`[AUTH] Usuario autenticado con ID: ${clerkId}`);

    return this.accountsService.getBalance(clerkId);
  }
}