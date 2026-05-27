import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SaleService } from './application/services/sale.service';
import { SaleEntity } from './domain/entities/sale.entity';
import { SaleController } from './infrastructure/http/sale.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SaleEntity])],
  providers: [SaleService],
  controllers: [SaleController],
  exports: [SaleService],
})
export class SalesModule {}
