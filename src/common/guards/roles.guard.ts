import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '../../users/entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) return true;

    const request = context.switchToHttp().getRequest();
    const clerkId = request.user?.id;
    if (!clerkId) throw new ForbiddenException('Sin autenticacion');

    const user = await this.userRepository.findOne({ where: { id: clerkId } });
    if (!user) throw new ForbiddenException('Usuario no encontrado');

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException('Acceso denegado: rol insuficiente');
    }

    request.dbUser = user;
    return true;
  }
}
