import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { CreatePersonDto } from '../central-bank/dto/create-person.dto';
import { AdminService } from './admin.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('admin')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Patch('users/:id/balance')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  adjustBalance(@Param('id') id: string, @Body('amount') amount: number) {
    return this.adminService.adjustBalance(id, Number(amount));
  }

  @Patch('users/:id/role')
  @Roles(UserRole.GERENTE)
  changeRole(
    @Req() req,
    @Param('id') id: string,
    @Body('role') role: UserRole,
  ) {
    return this.adminService.changeRole(req.user.id, id, role);
  }

  @Post('users/:id/sync-cbu')
  @Roles(UserRole.GERENTE)
  grantClientAccess(@Param('id') id: string, @Body() data: CreatePersonDto) {
    return this.adminService.grantClientAccess(id, data);
  }
}
