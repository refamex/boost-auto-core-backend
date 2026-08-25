import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductEntity } from '../pim/domain/entities/product.entity';
import { OrderService } from './application/services/order.service';
import { OrderItemEntity } from './domain/entities/order-item.entity';
import { OrderPaymentEntity } from './domain/entities/order-payment.entity';
import { OrderEntity } from './domain/entities/order.entity';
import { OrderController } from './infrastructure/http/order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      OrderPaymentEntity,
      ProductEntity,
    ]),
    InventoryModule,
  ],
  providers: [OrderService],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrdersModule {}
