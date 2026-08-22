import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface CotizacionDolar {
  casa: string;
  nombre: string;
  compra: number;
  venta: number;
  fechaActualizacion: string;
}

const DOLAR_API_URL =
  process.env.DOLAR_API_URL || 'https://dolarapi.com/v1/dolares';

/** Casa de cambio que usa el banco para convertir entre ARS y USD. */
const CASA_OPERATIVA = process.env.DOLAR_CASA || 'oficial';

/** La cotizacion no cambia segundo a segundo; cachearla evita pegarle a la API en cada request. */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class DolarService {
  private readonly logger = new Logger(DolarService.name);

  private cache: { at: number; data: CotizacionDolar[] } | null = null;

  /** Todas las cotizaciones publicadas por DolarAPI. */
  async getCotizaciones(): Promise<CotizacionDolar[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.data;
    }

    try {
      const response = await axios.get<CotizacionDolar[]>(DOLAR_API_URL, {
        timeout: 5000,
      });
      this.cache = { at: Date.now(), data: response.data };
      return response.data;
    } catch (error) {
      // Si la API publica se cae, servir una cotizacion vencida es mejor que
      // dejar al cliente sin poder operar; solo falla si nunca hubo uno.
      if (this.cache) {
        this.logger.warn(
          'DolarAPI no responde, usando la ultima cotizacion cacheada',
        );
        return this.cache.data;
      }

      this.logger.error(
        `DolarAPI no responde y no hay cache: ${(error as Error).message}`,
      );
      throw new HttpException(
        'No se pudo obtener la cotizacion del dolar',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** Cotizacion de la casa con la que opera el banco. */
  async getCotizacionOperativa(): Promise<CotizacionDolar> {
    const cotizaciones = await this.getCotizaciones();
    const cotizacion = cotizaciones.find((c) => c.casa === CASA_OPERATIVA);

    if (!cotizacion) {
      throw new HttpException(
        `La casa "${CASA_OPERATIVA}" no figura en DolarAPI`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return cotizacion;
  }
}
