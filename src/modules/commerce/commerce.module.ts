import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentMethodService } from './application/services/payment-method.service';
import { PriceListItemService } from './application/services/price-list-item.service';
import { PriceListService } from './application/services/price-list.service';
import { PaymentMethodEntity } from './domain/entities/payment-method.entity';
import { PriceListItemEntity } from './domain/entities/price-list-item.entity';
import { PriceListEntity } from './domain/entities/price-list.entity';
import { PaymentMethodController } from './infrastructure/http/payment-method.controller';
import { PriceListController } from './infrastructure/http/price-list.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PriceListEntity, PriceListItemEntity, PaymentMethodEntity]),
  ],
  providers: [PriceListService, PriceListItemService, PaymentMethodService],
  controllers: [PriceListController, PaymentMethodController],
  exports: [PriceListService, PriceListItemService, PaymentMethodService],
})
export class CommerceModule {}
