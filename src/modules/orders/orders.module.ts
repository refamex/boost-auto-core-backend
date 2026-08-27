import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceModule } from '../commerce/commerce.module';
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
    // Order pricing resolves through the same price list services `quotes`
    // uses. `commerce` imports nothing from `orders`, so there is no cycle.
    CommerceModule,
  ],
  providers: [OrderService],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrdersModule {}
