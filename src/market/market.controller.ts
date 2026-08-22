import { Controller, Get, UseGuards } from '@nestjs/common';
import { DolarService } from './dolar.service';
import { RatesService } from './rates.service';
import { ClerkAuthGuard } from '../auth/clerk.guard';

@Controller('market')
@UseGuards(ClerkAuthGuard)
export class MarketController {
  constructor(
    private readonly dolarService: DolarService,
    private readonly ratesService: RatesService,
  ) {}

  /** Cotizaciones del dolar, tal cual las publica DolarAPI. */
  @Get('dolares')
  getDolares() {
    return this.dolarService.getCotizaciones();
  }

  /** La cotizacion concreta con la que este banco convierte ARS <-> USD. */
  @Get('dolar')
  getDolarOperativo() {
    return this.dolarService.getCotizacionOperativa();
  }

  /** Tasas de prestamos personales del mercado, via ArgentinaDatos. */
  @Get('tasas/prestamos')
  getTasasPrestamos() {
    return this.ratesService.getTasasPrestamos();
  }

  /** Tasas de plazo fijo por banco, via ArgentinaDatos. */
  @Get('tasas/plazo-fijo')
  getTasasPlazoFijo() {
    return this.ratesService.getTasasPlazoFijo();
  }

  /** Ultimo valor publicado del indice UVA. */
  @Get('uva')
  getUva() {
    return this.ratesService.getUvaActual();
  }
}
