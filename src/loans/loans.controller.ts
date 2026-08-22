import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('prestamos')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  /** Simula un prestamo sin crearlo. Si no se manda tna, usa la del mercado. */
  @Post('simulaciones')
  simulate(@Body() body: { monto: number; plazoMeses: number; tna?: number }) {
    return this.loansService.simulate(body);
  }

  @Post()
  request(
    @Request() req,
    @Body() body: { monto: number; plazoMeses: number; tna?: number },
  ) {
    return this.loansService.request(this.clerkId(req), body);
  }

  @Get()
  findMine(@Request() req) {
    return this.loansService.findAllByUser(this.clerkId(req));
  }

  // ------------------------------------------- Cola de aprobacion (gerente)
  // Van antes de @Get(':id') para que "solicitudes" no se lea como un id.

  /** Solicitudes que quedaron a revision, con el informe de la central. */
  @Get('solicitudes/pendientes')
  @Roles(UserRole.GERENTE)
  listPending(@Request() req) {
    return this.loansService.listPending(this.clerkId(req));
  }

  @Post('solicitudes/:id/aprobar')
  @Roles(UserRole.GERENTE)
  approve(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.approve(this.clerkId(req), id);
  }

  @Post('solicitudes/:id/rechazar')
  @Roles(UserRole.GERENTE)
  reject(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('motivo') motivo?: string,
  ) {
    return this.loansService.reject(this.clerkId(req), id, motivo);
  }

  @Get(':id')
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.findOne(this.clerkId(req), id);
  }

  @Post(':id/pagos')
  pay(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.payNextInstallment(this.clerkId(req), id);
  }

  @Post(':id/precancelacion')
  prepay(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.loansService.prepay(this.clerkId(req), id);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
