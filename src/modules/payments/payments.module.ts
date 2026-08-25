import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '../orders/domain/entities/order.entity';
import { OrderPaymentEntity } from '../orders/domain/entities/order-payment.entity';
import { POLAR_CLIENT } from './application/ports/polar.client';
import { PolarCheckoutService } from './application/services/polar-checkout.service';
import { PolarWebhookService } from './application/services/polar-webhook.service';
import { PolarCheckoutEntity } from './domain/entities/polar-checkout.entity';
import { WebhookEventEntity } from './domain/entities/webhook-event.entity';
import { PolarSdkClient } from './infrastructure/polar/polar-sdk.client';
import { OrderPolarCheckoutController } from './infrastructure/http/order-polar-checkout.controller';
import { PolarCheckoutController } from './infrastructure/http/polar-checkout.controller';
import { PolarWebhookController } from './infrastructure/http/polar-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PolarCheckoutEntity,
      WebhookEventEntity,
      OrderEntity,
      OrderPaymentEntity,
    ]),
  ],
  providers: [
    { provide: POLAR_CLIENT, useClass: PolarSdkClient },
    PolarCheckoutService,
    PolarWebhookService,
  ],
  controllers: [
    OrderPolarCheckoutController,
    PolarCheckoutController,
    PolarWebhookController,
  ],
  exports: [PolarCheckoutService],
})
export class PaymentsModule {}
