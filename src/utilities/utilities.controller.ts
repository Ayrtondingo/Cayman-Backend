import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UtilitiesService } from './utilities.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('servicios')
@UseGuards(ClerkAuthGuard, RolesGuard)
export class UtilitiesController {
  constructor(private readonly utilitiesService: UtilitiesService) {}

  @Get('empresas')
  listCompanies() {
    return this.utilitiesService.listCompanies();
  }

  /** Servicios adheridos del cliente, con la deuda de cada uno ya resuelta. */
  @Get('adheridos')
  listSubscriptions(@Request() req) {
    return this.utilitiesService.listSubscriptions(this.clerkId(req));
  }

  /** Adherir un servicio para no tener que recordar el numero de cliente. */
  @Post('empresas/:id/adherir')
  subscribe(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { numeroCliente: string; apodo?: string },
  ) {
    return this.utilitiesService.subscribe(this.clerkId(req), id, body);
  }

  @Delete('adheridos/:id')
  unsubscribe(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.utilitiesService.unsubscribe(this.clerkId(req), id);
  }

  /** Deuda de un cliente con la empresa. El numeroCliente va por query. */
  @Get('empresas/:id/deuda')
  getDebt(
    @Param('id', ParseIntPipe) id: number,
    @Query('numeroCliente') numeroCliente: string,
  ) {
    return this.utilitiesService.getDebt(id, numeroCliente);
  }

  @Post('empresas/:id/pagos')
  payBill(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { numeroCliente: string; importe: number },
  ) {
    return this.utilitiesService.payBill(this.clerkId(req), id, body);
  }

  /** Padron de deudores de la empresa. Solo para el personal del banco. */
  @Get('empresas/:id/deudores')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  listDebtors(@Param('id', ParseIntPipe) id: number) {
    return this.utilitiesService.listDebtors(id);
  }

  /** Alta de factura. Fuera del estandar, pero necesaria para cargar deuda. */
  @Post('empresas/:id/facturas')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  createBill(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: { numeroCliente: string; importe: number; vencimiento: string },
  ) {
    return this.utilitiesService.createBill(id, body);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
