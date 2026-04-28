import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import axios from 'axios';
import { CreatePersonDto } from './dto/create-person.dto'; 

@Injectable()
export class CentralBankService {
  private readonly apiUrl = process.env.CENTRAL_BANK_URL || 'https://centralbank.brocoly.cc/api';
  private readonly apiKey = process.env.CENTRAL_BANK_API_KEY || 'dd0755e2-5dc6-48dc-bb5a-5aa28fc5bf2f';
  private readonly environment = 'test'; 

  async registerPerson(data: CreatePersonDto) {
  try {
    // Forzamos que los datos respeten el formato de la imagen
    const payload = {
      nombre: String(data.nombre),
      apellido: String(data.apellido),
      dni: String(data.dni), // <--- IMPORTANTE: Convertimos a String por si viene como número
    };

    console.log("Enviando a Brocoly:", payload);

    const response = await axios.post(`${this.apiUrl}/persons`, payload, {
      headers: {
        'x-api-key': this.apiKey, // Tu key: dd0755e2...
        'x-environment': 'test', // 'test' o 'prod'
        'Content-Type': 'application/json',
      },
    });
    
    return response.data;
  } catch (error: any) {
    console.log("Respuesta exacta de Brocoly:", error.response?.data);
    throw new HttpException(
      error.response?.data?.error || 'Error al registrar persona',
      error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}

  async registerTransaction(data: { 
    cbuOrigen: string, 
    cbuDestino: string, 
    importe: number, 
    saldoOrigen: number 
  }) {
    try {
      const response = await axios.post(`${this.apiUrl}/transactions`, data, {
        headers: { 
          'x-api-key': this.apiKey, 
          'x-environment': this.environment 
        },
      });
      return response.data;
    } catch (error: any) {
      console.log("Respuesta exacta de Brocoly (Transfer):", error.response?.data || error.message);
      
      throw new HttpException(
        error.response?.data?.error || 'Error en Red Central',
        error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getTransactions() {
    try {
      const response = await axios.get(`${this.apiUrl}/transactions`, {
        headers: {
          'x-api-key': this.apiKey,
          'x-environment': this.environment,
        },
      });
      return response.data;
    } catch (error: any) {
      console.error('⚠️ Error consultando historial:', error.response?.data || error.message);
      return [];
    }
  }
}