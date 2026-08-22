import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import { Currency } from '../common/enums/currency.enum';

export interface CentralBankPerson {
  cbu: string;
  nombre: string;
  apellido: string;
  dni?: string;
  alias?: string;
}

export interface CentralBankAccount {
  cbu: string;
  alias?: string;
  dni: string;
  nombre?: string;
  apellido?: string;
  moneda: Currency;
  saldo?: number;
}

export interface CentralBankBank {
  bankCode: string;
  name: string;
}

/** 1 = normal ... 5 = irrecuperable */
export type SituacionCrediticia = 1 | 2 | 3 | 4 | 5;

export interface DeudaInformada {
  entidad: string;
  monto: number;
  situacion: SituacionCrediticia;
}

export interface SituacionDeudor {
  dni: string;
  situacion: SituacionCrediticia;
  deudas: DeudaInformada[];
}

@Injectable()
export class CentralBankService {
  private readonly logger = new Logger(CentralBankService.name);

  private readonly apiUrl =
    process.env.CENTRAL_BANK_URL || 'https://centralbank.brocoly.cc/api';
  private readonly apiKey = process.env.CENTRAL_BANK_API_KEY;
  private readonly environment = process.env.CENTRAL_BANK_ENV || 'test';

  private get headers() {
    return {
      'x-api-key': this.apiKey,
      'x-environment': this.environment,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Traduce un fallo de axios a una HttpException con el status y el mensaje
   * que devolvio el Banco Central, en vez de tragarse el error.
   */
  private fail(operation: string, error: unknown): never {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
    }>;
    const status = axiosError.response?.status ?? HttpStatus.BAD_GATEWAY;
    // El spec documenta `message`, pero en la practica responde `error`.
    const message =
      axiosError.response?.data?.message ??
      axiosError.response?.data?.error ??
      axiosError.message ??
      'Error desconocido';

    this.logger.error(`${operation} fallo (${status}): ${message}`);
    throw new HttpException(`Banco Central - ${operation}: ${message}`, status);
  }

  // ---------------------------------------------------------------- Personas

  /**
   * POST /persons. Devuelve el CBU de la caja en pesos.
   * 201 = persona nueva, 200 = ya existia en este banco (sirve para resincronizar).
   */
  async registerPerson(data: {
    nombre: string;
    apellido: string;
    dni: string;
  }): Promise<CentralBankPerson> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/persons`,
        { nombre: data.nombre, apellido: data.apellido, dni: String(data.dni) },
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      // Sin fallback: un CBU inventado no existe en el Banco Central y hace
      // fallar toda transferencia posterior, pero mucho mas tarde y en silencio.
      this.fail('registrar persona', error);
    }
  }

  async getPersonByCbu(cbu: string): Promise<CentralBankPerson | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/persons/${cbu}`, {
        headers: this.headers,
      });
      return response.data;
    } catch {
      return null;
    }
  }

  async getPersonByAlias(alias: string): Promise<CentralBankPerson> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/persons/alias/${encodeURIComponent(alias)}`,
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      this.fail(`buscar alias ${alias}`, error);
    }
  }

  /** PUT /persons/{cbu}/alias. El alias es unico a nivel global. */
  async updateAlias(cbu: string, alias: string) {
    try {
      const response = await axios.put(
        `${this.apiUrl}/persons/${cbu}/alias`,
        { alias },
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      this.fail('actualizar alias', error);
    }
  }

  // ----------------------------------------------------------------- Cuentas

  /**
   * POST /accounts. Abre una caja de ahorro para una persona ya registrada.
   * Ojo: con ARS siempre responde 200 porque esa caja ya nacio con POST /persons;
   * la que realmente se crea aca es la de USD.
   */
  async openAccount(
    dni: string,
    moneda: Currency,
  ): Promise<CentralBankAccount> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/accounts`,
        { dni: String(dni), moneda },
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      this.fail(`abrir caja de ahorro en ${moneda}`, error);
    }
  }

  /** GET /accounts/{cbu}. Solo encuentra cuentas en monedas distintas de ARS. */
  async getAccountByCbu(cbu: string): Promise<CentralBankAccount | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/accounts/${cbu}`, {
        headers: this.headers,
      });
      return response.data;
    } catch {
      return null;
    }
  }

  async getAccountByAlias(alias: string): Promise<CentralBankAccount | null> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/accounts/alias/${encodeURIComponent(alias)}`,
        { headers: this.headers },
      );
      return response.data;
    } catch {
      return null;
    }
  }

  /** PUT /accounts/{cbu}/alias. Comparte el espacio de nombres con los alias de /persons. */
  async updateAccountAlias(cbu: string, alias: string) {
    try {
      const response = await axios.put(
        `${this.apiUrl}/accounts/${cbu}/alias`,
        { alias },
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      this.fail('actualizar alias de cuenta', error);
    }
  }

  /**
   * Busca un CBU primero como persona (caja en ARS) y despues como cuenta (USD).
   * El Banco Central los expone en endpoints distintos, asi que hay que probar los dos.
   */
  async resolveCbu(
    cbu: string,
  ): Promise<CentralBankPerson | CentralBankAccount | null> {
    return (
      (await this.getPersonByCbu(cbu)) ?? (await this.getAccountByCbu(cbu))
    );
  }

  /** Idem para alias, que son unicos entre personas y cuentas. */
  async resolveAlias(
    alias: string,
  ): Promise<CentralBankPerson | CentralBankAccount | null> {
    const account = await this.getAccountByAlias(alias);
    if (account) return account;
    try {
      return await this.getPersonByAlias(alias);
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ Bancos

  async listBanks(): Promise<CentralBankBank[]> {
    try {
      const response = await axios.get(`${this.apiUrl}/banks`, {
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      this.fail('listar bancos', error);
    }
  }

  /** Sirve para mostrar el nombre del banco de la contraparte en los movimientos. */
  async getBankByCode(bankCode: string): Promise<CentralBankBank | null> {
    try {
      const response = await axios.get(`${this.apiUrl}/banks/${bankCode}`, {
        headers: this.headers,
      });
      return response.data;
    } catch {
      return null;
    }
  }

  async renameOwnBank(name: string) {
    try {
      const response = await axios.put(
        `${this.apiUrl}/banks/me`,
        { name },
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      this.fail('renombrar banco', error);
    }
  }

  // ------------------------------------------------------ Central de deudores

  /**
   * POST /central-deudores. Informa lo que un titular le debe A ESTE banco.
   * Un solo informe activo por DNI: volver a llamar actualiza monto y situacion.
   */
  async reportDebt(dni: string, monto: number, situacion: SituacionCrediticia) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/central-deudores`,
        { dni: String(dni), monto, situacion },
        { headers: this.headers },
      );
      return response.data;
    } catch (error) {
      this.fail('informar deuda', error);
    }
  }

  /**
   * GET /central-deudores/{dni}. La situacion del titular es la PEOR de todas
   * las informadas por las distintas entidades.
   * Devuelve null si el DNI no figura (404), que no es lo mismo que estar en 1.
   */
  async getCreditSituation(dni: string): Promise<SituacionDeudor | null> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/central-deudores/${dni}`,
        {
          headers: this.headers,
        },
      );
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) return null;
      this.fail('consultar situacion crediticia', error);
    }
  }

  // ----------------------------------------------------------- Transacciones

  async registerTransaction(data: {
    cbuOrigen: string;
    cbuDestino: string;
    importe: number;
    saldoOrigen: number;
  }) {
    try {
      const response = await axios.post(`${this.apiUrl}/transactions`, data, {
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      this.fail('registrar transferencia', error);
    }
  }

  /** GET /transactions. Ultimas 100 en las que participa este banco. */
  async getTransactions(minutos = 30) {
    try {
      const response = await axios.get(`${this.apiUrl}/transactions`, {
        params: { minutos },
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      this.fail('listar transferencias', error);
    }
  }
}
