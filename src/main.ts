import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT) || 4000;
  const frontendUrls = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
  const allowedOrigins = Array.from(
    new Set([...frontendUrls, 'http://localhost:5173', 'http://127.0.0.1:5173']),
  );
  const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === 'true';

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe());
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const isAllowedOrigin = allowedOrigins.includes(origin);
      const isVercelPreview = allowVercelPreviews && /^https:\/\/[\w-]+\.vercel\.app$/.test(origin);

      return callback(null, isAllowedOrigin || isVercelPreview);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(port);
  console.log(`Backend corriendo en puerto ${port}`);
}

bootstrap();
