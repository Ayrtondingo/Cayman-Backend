import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; // Importamos Config
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AccountsModule } from './accounts/accounts.module';

@Module({
  imports: [
    // 1. Cargamos el ConfigModule para leer el .env (que crearemos ahora)
    ConfigModule.forRoot({
      isGlobal: true, 
    }),
    
    // 2. Usamos forRootAsync para que sea más limpio
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASS', '327487'),
        database: configService.get<string>('DB_NAME', 'cayman_bank'),
        autoLoadEntities: true,
        synchronize: true, // Solo para desarrollo
      }),
    }),

    AuthModule,
    UsersModule,
    TransactionsModule,
    AccountsModule,
  ],
})
export class AppModule {}