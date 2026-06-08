import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';

export interface CentralBankPerson {
  cbu: string;
  nombre: string;
  apellido: string;
  dni?: string;
  alias?: string;
}

@Injectable()
export class CentralBankService {
  private readonly apiUrl = process.env.CENTRAL_BANK_URL || 'https://centralbank.brocoly.cc/api';
  private readonly apiKey = process.env.CENTRAL_BANK_API_KEY;
  private readonly environment = process.env.CENTRAL_BANK_ENV || 'test';

  private get headers() {
    return {
      'x-api-key': this.apiKey,
      'x-environment': this.environment,
      'Content-Type': 'application/json',
    };
  }

  async registerPerson(data: { nombre: string; apellido: string; dni: string }) {
    try {
      const response = await axios.post(
        `${this.apiUrl}/persons`,
        {
          nombre: data.nombre,
          apellido: data.apellido,
          dni: String(data.dni),
        },
        { headers: this.headers },
      );
      return response.data;
    } catch (error: any) {
      console.log('Red Central rechazada. Usando CBU de prueba.');
      return {
        cbu: `00100014${data.dni.padStart(8, '0')}0000105`,
        nombre: data.nombre,
        apellido: data.apellido,
        dni: data.dni,
      };
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
      const response = await axios.get(`${this.apiUrl}/persons/alias/${encodeURIComponent(alias)}`, {
        headers: this.headers,
      });
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data?.error || 'Alias no encontrado',
        error.response?.status || HttpStatus.NOT_FOUND,
      );
    }
  }

  async updateAlias(cbu: string, alias: string) {
    try {
      const response = await axios.put(
        `${this.apiUrl}/persons/${cbu}/alias`,
        { alias },
        { headers: this.headers },
      );
      return response.data;
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Error actualizando alias',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

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
    } catch (error: any) {
      throw new HttpException(
        error.response?.data || 'Error en transferencia',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  async getTransactions(minutos = 30) {
    try {
      const response = await axios.get(`${this.apiUrl}/transactions`, {
        params: { minutos },
        headers: this.headers,
      });
      return response.data;
    } catch (error) {
      return [];
    }
  }
}
