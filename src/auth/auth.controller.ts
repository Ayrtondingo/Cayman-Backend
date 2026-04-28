import { Controller, Put, Body, UseGuards, Request } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { ClerkAuthGuard } from './clerk.guard'; // El nuevo Guard

@Controller('auth')
export class AuthController {
  constructor(private usersService: UsersService) {}

  @UseGuards(ClerkAuthGuard)
  @Put('profile')
  updateProfile(@Request() req, @Body() updateData: any) {
    // req.user.id ahora contiene el ID de Clerk (ej: "user_2N9...")
    const clerkId = req.user.id;
    return this.usersService.updateProfile(clerkId, updateData);
  }
}