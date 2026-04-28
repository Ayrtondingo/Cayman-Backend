import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async signIn(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Usamos esta sintaxis para que TypeScript no bloquee la compilación
    const userPassword = (user as any).password;

    if (!userPassword) {
      throw new UnauthorizedException('El usuario no posee contraseña local');
    }

    const isMatch = await bcrypt.compare(pass, userPassword);
    
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const payload = { userId: user.id, email: user.email }; 
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}