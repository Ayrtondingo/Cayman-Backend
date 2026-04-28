import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createClerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    // 1. Verificamos si existe el header
    if (!authHeader) {
      console.error('--- ERROR: No llegó el header de Authorization ---');
      throw new UnauthorizedException('No se envió el token');
    }

    const token = authHeader.split(' ')[1];

    // 2. Verificamos si el token tiene el formato JWT (Header.Payload.Signature)
    if (!token || token === 'null' || token === 'undefined' || token.split('.').length !== 3) {
      console.error('--- ERROR: JWT Mal formado ---');
      console.error('Lo que recibió el backend fue:', token);
      throw new UnauthorizedException('Token inválido o mal formado');
    }

    try {
      // 3. Verificación manual del token
      const decoded = await this.clerkClient.verifyToken(token);
      
      // Seteamos el user id para que el controlador lo use como req.user.id
      request.user = { id: decoded.sub };
      
      return true;
    } catch (err) {
      console.error('--- ERROR DE VALIDACIÓN CLERK ---');
      console.error('Mensaje:', err.message);
      throw new UnauthorizedException('Token de Clerk expirado o inválido');
    }
  }
}