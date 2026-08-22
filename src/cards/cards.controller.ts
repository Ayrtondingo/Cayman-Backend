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
import { CardsService } from './cards.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller()
@UseGuards(ClerkAuthGuard, RolesGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  /** Emite una tarjeta de debito (ligada a un CBU) o de credito (con limite). */
  @Post('tarjetas')
  issue(
    @Request() req,
    @Body() body: { tipo: string; cbuAsociado?: string; limite?: number },
  ) {
    return this.cardsService.issue(this.clerkId(req), body);
  }

  /** Tarjetas del cliente autenticado. */
  @Get('tarjetas')
  findMine(@Request() req) {
    return this.cardsService.findAllByUser(this.clerkId(req));
  }

  /** Tarjetas de cualquier cliente por DNI. Solo para el personal del banco. */
  @Get('persons/:dni/tarjetas')
  @Roles(UserRole.ADMIN, UserRole.GERENTE)
  findByDni(@Param('dni') dni: string) {
    return this.cardsService.findAllByDni(dni);
  }

  /** Autoriza un consumo: valida saldo (debito) o limite disponible (credito). */
  @Post('tarjetas/:id/autorizaciones')
  authorize(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { comercio: string; monto: number; cuotas?: number },
  ) {
    return this.cardsService.authorize(this.clerkId(req), id, body);
  }

  @Post('tarjetas/:id/bloqueo')
  setBlock(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('accion') accion: string,
  ) {
    return this.cardsService.setBlock(this.clerkId(req), id, accion);
  }

  /**
   * Datos completos de la tarjeta, para pagar online.
   * Endpoint aparte para que el numero no viaje en cada listado.
   */
  @Get('tarjetas/:id/datos')
  reveal(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.cardsService.reveal(this.clerkId(req), id);
  }

  /** Resumen mensual. Solo tiene sentido en credito. */
  @Get('tarjetas/:id/resumen')
  statement(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.cardsService.statement(this.clerkId(req), id);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
