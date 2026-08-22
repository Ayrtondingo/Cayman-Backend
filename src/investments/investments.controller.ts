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
import { InvestmentsService } from './investments.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller()
@UseGuards(ClerkAuthGuard, RolesGuard)
export class InvestmentsController {
  constructor(private readonly investmentsService: InvestmentsService) {}

  // ------------------------------------------------------- Plazos fijos

  @Post('plazos-fijos')
  createFixedTerm(
    @Request() req,
    @Body()
    body: { capital: number; plazoDias: number; tna?: number; tipo?: string },
  ) {
    return this.investmentsService.createFixedTerm(this.clerkId(req), body);
  }

  @Get('plazos-fijos')
  findMine(@Request() req) {
    return this.investmentsService.findFixedTermsByUser(this.clerkId(req));
  }

  @Get('plazos-fijos/:id')
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.investmentsService.findFixedTerm(this.clerkId(req), id);
  }

  /** Acredita capital mas intereses al vencer. Fuera del estandar, pero sin
   *  esto el plazo fijo nunca devuelve la plata. */
  @Post('plazos-fijos/:id/acreditacion')
  settle(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.investmentsService.settleFixedTerm(this.clerkId(req), id);
  }

  @Get('persons/:dni/plazos-fijos')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  findByDni(@Param('dni') dni: string) {
    return this.investmentsService.findFixedTermsByDni(dni);
  }

  // ------------------------------------------------------------ CEDEARs

  @Get('inversiones/cedears')
  listCedears() {
    return this.investmentsService.listCedears();
  }

  @Post('inversiones/cedears/ordenes')
  placeOrder(
    @Request() req,
    @Body() body: { ticker: string; cantidad: number; tipo: string },
  ) {
    return this.investmentsService.placeOrder(this.clerkId(req), body);
  }

  @Get('inversiones/portafolio-cedears')
  getPortfolio(@Request() req) {
    return this.investmentsService.getPortfolio(this.clerkId(req));
  }

  @Get('persons/:dni/portafolio-cedears')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  getPortfolioByDni(@Param('dni') dni: string) {
    return this.investmentsService.getPortfolioByDni(dni);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
