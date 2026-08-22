import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      message: 'Cayman Bank Backend is running',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      // Render inyecta el SHA del commit desplegado. Sirve para saber si un
      // arreglo ya esta en produccion sin tener que deducirlo por las rutas.
      commit: (process.env.RENDER_GIT_COMMIT ?? 'local').slice(0, 7),
      rama: process.env.RENDER_GIT_BRANCH ?? 'local',
    };
  }
}
