import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommerceModule } from '../commerce/commerce.module';
import { CustomersModule } from '../customers/customers.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductEntity } from '../pim/domain/entities/product.entity';
import { QuoteService } from './application/services/quote.service';
import { QuoteItemEntity } from './domain/entities/quote-item.entity';
import { QuoteEntity } from './domain/entities/quote.entity';
import { QuoteController } from './infrastructure/http/quote.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([QuoteEntity, QuoteItemEntity, ProductEntity]),
    // CommerceModule for server-side price resolution, OrdersModule to convert
    // an approved quote in-process. Neither imports quotes, so no cycle.
    CommerceModule,
    CustomersModule,
    OrdersModule,
  ],
  providers: [QuoteService],
  controllers: [QuoteController],
  exports: [QuoteService],
})
export class QuotesModule {}
