import { Controller, Post, Get, Body, UseGuards, Req, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { ClerkAuthGuard } from '../auth/clerk.guard'; // Asegúrate de que la ruta sea correcta

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  async getMe(@Req() req) {
    const userId = req.user.id; 
    const user = await this.usersService.findOne(userId);
    if (!user) throw new NotFoundException('Usuario no registrado en la DB');

    return {
      fullName: user.fullName,
      balance: user.account?.balance ?? 0,
      accountNumber: user.account?.accountNumber ?? 'PENDIENTE',
      transactions: await this.usersService.getCombinedHistory(userId), 
    };
  }

  @Post('sync')
  async syncUser(@Body() data: { clerkId: string; email: string; fullName: string }) {
    const existingUser = await this.usersService.findOne(data.clerkId);
    if (existingUser) return { message: 'Usuario ya existente', user: existingUser };

    return await this.usersService.createFromClerk(
      data.clerkId,
      data.email,
      data.fullName
    );
  }

  // 3. CORREGIDO: Agregamos el Guard y ordenamos los parámetros
  @Post('sync-cbu')
  @UseGuards(ClerkAuthGuard) // <--- CRÍTICO: Para que no de 401
  async syncCbu(
    @Req() req, // Sacamos el ID del token por seguridad
    @Body() data: CreatePersonDto 
  ) {
    // Es mejor usar el ID que viene del token (req.user.id) 
    // que el que viene del body para evitar que alguien use el ID de otro.
    const clerkId = req.user.id; 
    return await this.usersService.syncWithCentralBank(clerkId, data);
  }

  
}