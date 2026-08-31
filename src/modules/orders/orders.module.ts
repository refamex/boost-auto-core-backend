import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceModule } from '../commerce/commerce.module';
import { CustomersModule } from '../customers/customers.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ProductEntity } from '../pim/domain/entities/product.entity';
import { OrderService } from './application/services/order.service';
import { OrderItemEntity } from './domain/entities/order-item.entity';
import { OrderStatusEventEntity } from './domain/entities/order-status-event.entity';
import { OrderPaymentEntity } from './domain/entities/order-payment.entity';
import { OrderEntity } from './domain/entities/order.entity';
import { OrderController } from './infrastructure/http/order.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OrderEntity,
      OrderItemEntity,
      OrderPaymentEntity,
      OrderStatusEventEntity,
      ProductEntity,
    ]),
    InventoryModule,
    CommerceModule,
    CustomersModule,
  ],
  providers: [OrderService],
  controllers: [OrderController],
  exports: [OrderService],
})
export class OrdersModule {}
