import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!process.env.CLERK_SECRET_KEY) {
      throw new UnauthorizedException('Servidor sin CLERK_SECRET_KEY configurada');
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('No se envio el token');
    }

    const token = authHeader.split(' ')[1];

    if (!token || token === 'null' || token === 'undefined' || token.split('.').length !== 3) {
      throw new UnauthorizedException('Token invalido o mal formado');
    }

    try {
      const decoded = await this.clerkClient.verifyToken(token);
      request.user = { id: decoded.sub };
      return true;
    } catch (err: unknown) {
      console.error('--- ERROR DE VALIDACION CLERK ---');
      console.error('Mensaje:', err instanceof Error ? err.message : err);
      throw new UnauthorizedException('Token de Clerk expirado o invalido');
    }
  }
}
