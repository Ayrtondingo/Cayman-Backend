import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; // Importamos Config
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AccountsModule } from './accounts/accounts.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AdminModule } from './admin/admin.module';
import { MarketModule } from './market/market.module';
import { CardsModule } from './cards/cards.module';
import { LoansModule } from './loans/loans.module';
import { UtilitiesModule } from './utilities/utilities.module';
import { TopupsModule } from './topups/topups.module';
import { InvestmentsModule } from './investments/investments.module';
import { InsuranceModule } from './insurance/insurance.module';
import { ReportsModule } from './reports/reports.module';
import { ChatModule } from './chat/chat.module';

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
      useFactory: (configService: ConfigService) => {
        const useDatabaseUrl =
          configService.get<string>('USE_DATABASE_URL') === 'true';
        const databaseUrl = useDatabaseUrl
          ? configService.get<string>('DATABASE_URL')
          : undefined;

        return {
          type: 'postgres',
          url: databaseUrl,
          host: databaseUrl
            ? undefined
            : configService.get<string>('DB_HOST', 'localhost'),
          port: databaseUrl
            ? undefined
            : configService.get<number>('DB_PORT', 5432),
          username: databaseUrl
            ? undefined
            : configService.get<string>('DB_USER', 'postgres'),
          password: databaseUrl
            ? undefined
            : configService.get<string>('DB_PASS', '327487'),
          database: databaseUrl
            ? undefined
            : configService.get<string>('DB_NAME', 'cayman_bank'),
          ssl: databaseUrl ? { rejectUnauthorized: false } : false,
          extra: {
            connectionTimeoutMillis: 5000,
          },
          autoLoadEntities: true,
          synchronize: true,
        };
      },
    }),

    AuthModule,
    UsersModule,
    TransactionsModule,
    AccountsModule,
    AdminModule,
    MarketModule,
    CardsModule,
    LoansModule,
    UtilitiesModule,
    TopupsModule,
    InvestmentsModule,
    InsuranceModule,
    ReportsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
