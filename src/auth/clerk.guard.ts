// backend/src/auth/clerk.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private clerk;

  constructor() {
    this.clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No se proporcionó un token');
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = await this.clerk.verifyToken(token);
      request.user = { id: decoded.sub }; 
      return true;
    } catch (err: any) { // <--- Agregamos ': any' para que err.message no esté en rojo
      console.error("Error en Guard:", err.message);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}