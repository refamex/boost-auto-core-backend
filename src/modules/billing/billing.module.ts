import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceService } from './application/services/invoice.service';
import { StampingService } from './application/services/stamping.service';
import { STAMPING_PROVIDER } from './domain/stamping.port';
import { InvoiceDocumentEntity } from './domain/entities/invoice-document.entity';
import { InvoiceEntity } from './domain/entities/invoice.entity';
import { InvoiceController } from './infrastructure/http/invoice.controller';
import { UnconfiguredStampingProvider } from './infrastructure/pac/unconfigured-stamping.provider';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, InvoiceDocumentEntity])],
  providers: [
    InvoiceService,
    StampingService,
    // El dia que se contrate un PAC, esta linea apunta a su adaptador y nada
    // mas cambia. Hoy responde "no disponible", nunca un exito inventado.
    { provide: STAMPING_PROVIDER, useClass: UnconfiguredStampingProvider },
  ],
  controllers: [InvoiceController],
  exports: [InvoiceService],
})
export class BillingModule {}
