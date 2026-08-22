import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { ClerkAuthGuard } from '../auth/clerk.guard'; // Asegúrate de que la ruta sea correcta
import { Currency } from '../common/enums/currency.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  async getMe(@Req() req) {
    const userId = req.user.id;
    const user = await this.usersService.findOne(userId);
    if (!user) {
      return {
        fullName: 'Usuario Cayman',
        balance: 0,
        cbu: null,
        accountNumber: null,
        alias: null,
        dni: null,
        accounts: [],
        transactions: [],
      };
    }

    const accounts = user.accounts ?? [];
    const primary =
      accounts.find((account) => account.currency === Currency.ARS) ?? null;

    return {
      fullName: user.fullName,
      role: user.role,
      dni: user.dni,
      balance: primary?.balance ?? 0,
      cbu: primary?.cbu ?? null,
      // Alias de `cbu`. Se mantiene mientras el frontend siga leyendo este campo.
      accountNumber: primary?.cbu ?? null,
      alias: primary?.alias ?? null,
      accounts: accounts.map((account) => ({
        cbu: account.cbu,
        alias: account.alias,
        currency: account.currency,
        balance: Number(account.balance),
      })),
      transactions: await this.usersService.getCombinedHistory(userId),
    };
  }

  @Post('sync')
  async syncUser(
    @Body() data: { clerkId: string; email: string; fullName: string },
  ) {
    return await this.usersService.createFromClerk(
      data.clerkId,
      data.email,
      data.fullName,
    );
  }

  // 3. CORREGIDO: Agregamos el Guard y ordenamos los parámetros
  @Post('sync-cbu')
  @UseGuards(ClerkAuthGuard) // <--- CRÍTICO: Para que no de 401
  async syncCbu(
    @Req() req, // Sacamos el ID del token por seguridad
    @Body() data: CreatePersonDto,
  ) {
    // Es mejor usar el ID que viene del token (req.user.id)
    // que el que viene del body para evitar que alguien use el ID de otro.
    const clerkId = req.user.id;
    return await this.usersService.syncWithCentralBank(clerkId, data);
  }

  @Post('alias')
  @UseGuards(ClerkAuthGuard)
  async updateAlias(@Req() req, @Body('alias') alias: string) {
    return await this.usersService.updateAlias(req.user.id, alias);
  }

  /** Situacion crediticia del cliente segun la central de deudores. */
  @Get('me/situacion-crediticia')
  @UseGuards(ClerkAuthGuard)
  async getCreditSituation(@Req() req) {
    return await this.usersService.getCreditSituation(req.user.id);
  }
}
