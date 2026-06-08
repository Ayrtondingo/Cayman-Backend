import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      message: 'Cayman Bank Backend is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }
}
