import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface TasaPrestamo {
  entidad: string;
  nombreComercial: string;
  producto: string;
  tna: number | null;
  tea: number | null;
  cftTea: number | null;
  moneda: string;
}

export interface TasaPlazoFijo {
  entidad: string;
  tnaClientes: number | null;
  tnaNoClientes: number | null;
}

export interface ValorUva {
  fecha: string;
  valor: number;
}

/** Fila cruda de data912. `c` es el ultimo precio operado. */
interface Data912Row {
  symbol: string;
  c: number;
  px_bid: number;
  px_ask: number;
  pct_change: number;
}

export interface Cedear {
  ticker: string;
  precioARS: number;
  compra: number;
  venta: number;
  variacion: number;
}

const PRESTAMOS_URL =
  process.env.RATES_PRESTAMOS_URL ||
  'https://api.argentinadatos.com/v1/finanzas/creditos/prestamosPersonales';

const PLAZO_FIJO_URL =
  process.env.RATES_PLAZO_FIJO_URL ||
  'https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo';

const UVA_URL =
  process.env.RATES_UVA_URL ||
  'https://api.argentinadatos.com/v1/finanzas/indices/uva';

const CEDEARS_URL =
  process.env.CEDEARS_URL || 'https://data912.com/live/arg_cedears';

/** Las tasas se publican una vez por dia; media hora de cache es de sobra. */
const CACHE_TTL_MS = 30 * 60_000;

/** Fallbacks si ArgentinaDatos no responde y todavia no hay nada cacheado. */
const TNA_PRESTAMO_DEFAULT = Number(process.env.LOAN_TNA_DEFAULT ?? 0.7);
const TNA_PLAZO_FIJO_DEFAULT = Number(
  process.env.FIXED_TERM_TNA_DEFAULT ?? 0.3,
);

/**
 * Tasas de referencia del mercado, tomadas de ArgentinaDatos.
 *
 * El banco no esta obligado a usarlas tal cual: sirven para que la TNA que
 * ofrecemos sea un numero real y no uno inventado.
 */
@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);

  private cache = new Map<string, { at: number; data: unknown }>();

  /**
   * Un GET con un reintento. Estas APIs publicas devuelven 502 de vez en
   * cuando y se recuperan solas, asi que no vale la pena rendirse al primer fallo.
   */
  private async getWithRetry<T>(url: string, attempts = 2): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const response = await axios.get<T>(url, { timeout: 8000 });
        return response.data;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
        }
      }
    }

    throw lastError;
  }

  private async fetchCached<T>(key: string, url: string): Promise<T | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.data as T;
    }

    try {
      const data = await this.getWithRetry<T>(url);
      this.cache.set(key, { at: Date.now(), data });
      return data;
    } catch (error) {
      if (hit) {
        this.logger.warn(
          `${key}: la API no responde, uso la ultima respuesta cacheada`,
        );
        return hit.data as T;
      }

      this.logger.warn(
        `${key}: la API no responde y no hay cache (${(error as Error).message})`,
      );
      return null;
    }
  }

  async getTasasPrestamos(): Promise<TasaPrestamo[]> {
    return (
      (await this.fetchCached<TasaPrestamo[]>('prestamos', PRESTAMOS_URL)) ?? []
    );
  }

  async getTasasPlazoFijo(): Promise<TasaPlazoFijo[]> {
    return (
      (await this.fetchCached<TasaPlazoFijo[]>('plazoFijo', PLAZO_FIJO_URL)) ??
      []
    );
  }

  /**
   * TNA de referencia para prestamos personales: la mediana del mercado en ARS.
   * La mediana y no el promedio, para que una entidad con una tasa extrema
   * no arrastre el numero.
   */
  async getTnaPrestamoReferencia(): Promise<number> {
    const tasas = (await this.getTasasPrestamos())
      .filter(
        (tasa) =>
          tasa.moneda === 'ARS' && typeof tasa.tna === 'number' && tasa.tna > 0,
      )
      .map((tasa) => tasa.tna as number)
      .sort((a, b) => a - b);

    if (!tasas.length) return TNA_PRESTAMO_DEFAULT;

    const mid = Math.floor(tasas.length / 2);
    return tasas.length % 2 ? tasas[mid] : (tasas[mid - 1] + tasas[mid]) / 2;
  }

  /** TNA de referencia para plazos fijos: la mejor tasa para clientes. */
  async getTnaPlazoFijoReferencia(): Promise<number> {
    const tasas = (await this.getTasasPlazoFijo())
      .map((tasa) => tasa.tnaClientes)
      .filter((tna): tna is number => typeof tna === 'number' && tna > 0);

    if (!tasas.length) return TNA_PLAZO_FIJO_DEFAULT;

    return Math.max(...tasas);
  }

  /** Serie historica del indice UVA. */
  async getSerieUva(): Promise<ValorUva[]> {
    return (await this.fetchCached<ValorUva[]>('uva', UVA_URL)) ?? [];
  }

  /** Ultimo valor publicado de la UVA. */
  async getUvaActual(): Promise<ValorUva | null> {
    const serie = await this.getSerieUva();
    return serie.length ? serie[serie.length - 1] : null;
  }

  /**
   * Catalogo de CEDEARs con cotizacion, via data912.
   *
   * Se filtran los papeles sin precio: la API devuelve casi mil simbolos y
   * muchos no operaron, asi que vendrian con precio 0 y romperian una compra.
   */
  async getCedears(): Promise<Cedear[]> {
    const rows = await this.fetchCached<Data912Row[]>('cedears', CEDEARS_URL);
    if (!rows) return [];

    return rows
      .filter((row) => row.symbol && Number(row.c) > 0)
      .map((row) => ({
        ticker: row.symbol,
        precioARS: Number(row.c),
        compra: Number(row.px_bid) || Number(row.c),
        venta: Number(row.px_ask) || Number(row.c),
        variacion: Number(row.pct_change) || 0,
      }))
      .sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async getCedear(ticker: string): Promise<Cedear | null> {
    const normalized = String(ticker ?? '').toUpperCase();
    const cedears = await this.getCedears();
    return cedears.find((cedear) => cedear.ticker === normalized) ?? null;
  }
}
