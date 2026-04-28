import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // 1. Prefijo para todas las rutas
  app.setGlobalPrefix('api'); 
  
  // 2. Validación automática de DTOs
  app.useGlobalPipes(new ValidationPipe());

  // 3. Configuración de CORS corregida
  // Esto permite que tu Next.js (en el 3000) le pegue a NestJS (en el 4000)
  app.enableCors({
    origin: 'http://localhost:3000', // La URL de tu Next.js
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  
  // 4. CAMBIO DE PUERTO A 4000
  // Next.js usa el 3000 por defecto, así que NestJS debe ir al 4000
  await app.listen(4000);
  
  console.log(`🚀 Backend corriendo en: http://localhost:4000/api`);
}
bootstrap();