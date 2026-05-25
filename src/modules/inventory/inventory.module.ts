import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INVENTORY_REPOSITORY } from './application/ports/inventory.repository';
import { AdjustStockUseCase } from './application/use-cases/adjust-stock.use-case';
import { ListStockUseCase, SummaryBySkuUseCase } from './application/use-cases/read-stock.use-case';
import { ReleaseStockUseCase } from './application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from './application/use-cases/reserve-stock.use-case';
import { InventoryEntity } from './domain/entities/inventory.entity';
import { InventoryController } from './infrastructure/http/inventory.controller';
import { TypeOrmInventoryRepository } from './infrastructure/persistence/typeorm-inventory.repository';

@Module({
  imports: [TypeOrmModule.forFeature([InventoryEntity])],
  providers: [
    { provide: INVENTORY_REPOSITORY, useClass: TypeOrmInventoryRepository },
    ReserveStockUseCase,
    ReleaseStockUseCase,
    AdjustStockUseCase,
    ListStockUseCase,
    SummaryBySkuUseCase,
  ],
  controllers: [InventoryController],
  // Exportar el port y los use-cases para que orders/sales (próximos PRs)
  // los consuman directamente, sin pasar por HTTP.
  exports: [INVENTORY_REPOSITORY, ReserveStockUseCase, ReleaseStockUseCase],
})
export class InventoryModule {}
