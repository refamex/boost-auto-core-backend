import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '../orders/domain/entities/order.entity';
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
