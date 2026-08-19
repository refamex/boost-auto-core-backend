import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './shared/config/configuration';
import { validationSchema } from './shared/config/validation.schema';
import { AuthModule } from './shared/auth/auth.module';
import { HealthModule } from './shared/health/health.module';
import { PimModule } from './modules/pim/pim.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { CompatibilityModule } from './modules/compatibility/compatibility.module';
import { CommerceModule } from './modules/commerce/commerce.module';
import { OrdersModule } from './modules/orders/orders.module';
import { SalesModule } from './modules/sales/sales.module';
import { BillingModule } from './modules/billing/billing.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { ShippingModule } from './modules/shipping/shipping.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const db = config.get('db', { infer: true });
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.pass,
          database: db.name,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          autoLoadEntities: true,
          synchronize: false,
          migrationsRun: false,
          logging: config.get('env', { infer: true }) === 'development' ? ['error', 'warn'] : ['error'],
        };
      },
    }),
    AuthModule,
    HealthModule,
    PimModule,
    SuppliersModule,
    InventoryModule,
    VehiclesModule,
    CompatibilityModule,
    CommerceModule,
    OrdersModule,
    SalesModule,
    BillingModule,
    IntegrationsModule,
    PaymentsModule,
    ShippingModule,
    QuotesModule,
  ],
})
export class AppModule {}
