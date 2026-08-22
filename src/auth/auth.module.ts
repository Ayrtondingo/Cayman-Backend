import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';

/**
 * La autenticacion la resuelve Clerk en ClerkAuthGuard.
 * Este modulo solo expone la actualizacion de perfil.
 */
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
})
export class AuthModule {}
