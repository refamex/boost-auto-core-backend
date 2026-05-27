import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InvoiceService } from './application/services/invoice.service';
import { InvoiceDocumentEntity } from './domain/entities/invoice-document.entity';
import { InvoiceEntity } from './domain/entities/invoice.entity';
import { InvoiceController } from './infrastructure/http/invoice.controller';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceEntity, InvoiceDocumentEntity])],
  providers: [InvoiceService],
  controllers: [InvoiceController],
  exports: [InvoiceService],
})
export class BillingModule {}
