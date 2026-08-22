import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { InsuranceService } from './insurance.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';
import { Beneficiario } from './entities/insurance-policy.entity';

@Controller('seguros')
@UseGuards(ClerkAuthGuard)
export class InsuranceController {
  constructor(private readonly insuranceService: InsuranceService) {}

  @Get('productos')
  listProducts() {
    return this.insuranceService.listProducts();
  }

  /** Cotiza una prima de referencia sin contratar nada. */
  @Get('primas')
  quote(
    @Query('productoId', ParseIntPipe) productoId: number,
    @Query('sumaAsegurada') sumaAsegurada: string,
    @Query('edad', ParseIntPipe) edad: number,
  ) {
    return this.insuranceService.quote(productoId, Number(sumaAsegurada), edad);
  }

  @Post('polizas')
  createPolicy(
    @Request() req,
    @Body()
    body: {
      productoId: number;
      sumaAsegurada: number;
      beneficiarios?: Beneficiario[];
      edad?: number;
    },
  ) {
    return this.insuranceService.createPolicy(this.clerkId(req), body);
  }

  @Get('polizas')
  findMine(@Request() req) {
    return this.insuranceService.findPoliciesByUser(this.clerkId(req));
  }

  @Get('polizas/:id')
  findOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.insuranceService.findPolicy(this.clerkId(req), id);
  }

  @Post('polizas/:id/siniestros')
  createClaim(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('descripcion') descripcion: string,
  ) {
    return this.insuranceService.createClaim(this.clerkId(req), id, descripcion);
  }

  @Get('polizas/:id/siniestros')
  listClaims(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.insuranceService.listClaims(this.clerkId(req), id);
  }

  private clerkId(req): string {
    return req.auth?.userId || req.user?.id;
  }
}
