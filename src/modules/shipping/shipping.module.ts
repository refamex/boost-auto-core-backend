import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderItemEntity } from '../orders/domain/entities/order-item.entity';
import { OrderEntity } from '../orders/domain/entities/order.entity';
import { PolarCheckoutEntity } from '../payments/domain/entities/polar-checkout.entity';
import { ProductDimensionEntity } from '../pim/domain/entities/product-dimension.entity';
import { SKYDROPX_CLIENT } from './application/ports/skydropx.client';
import { ShipmentService } from './application/services/shipment.service';
import { ShippingQuoteService } from './application/services/shipping-quote.service';
import { ShippingWebhookService } from './application/services/shipping-webhook.service';
import { ShipmentTrackingEventEntity } from './domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from './domain/entities/shipment.entity';
import { ShippingWebhookEventEntity } from './domain/entities/shipping-webhook-event.entity';
import { ShippingWebhookController } from './infrastructure/http/shipping-webhook.controller';
import { ShippingController } from './infrastructure/http/shipping.controller';
import { SkydropxHttpClient } from './infrastructure/skydropx/skydropx-http.client';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ShipmentEntity,
      ShipmentTrackingEventEntity,
      ShippingWebhookEventEntity,
      OrderEntity,
      // Registering another context's entity, not importing its module — the
      // same thing this module already did with OrderEntity. Quoting needs the
      // lines and their catalogue dimensions to size the box, and the live
      // checkout row to know whether the freight may still change.
      OrderItemEntity,
      ProductDimensionEntity,
      PolarCheckoutEntity,
    ]),
  ],
  providers: [
    { provide: SKYDROPX_CLIENT, useClass: SkydropxHttpClient },
    ShippingQuoteService,
    ShipmentService,
    ShippingWebhookService,
  ],
  controllers: [ShippingController, ShippingWebhookController],
  exports: [ShipmentService, ShippingQuoteService],
})
export class ShippingModule {}
