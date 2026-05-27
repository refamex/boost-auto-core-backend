import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Polar } from '@polar-sh/sdk';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  CreatePolarCheckoutInput,
  PolarCheckoutResult,
  PolarClient,
} from '../../application/ports/polar.client';

@Injectable()
export class PolarSdkClient implements PolarClient {
  private readonly polar: Polar;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const polar = this.config.get('polar', { infer: true });
    this.polar = new Polar({
      accessToken: polar.accessToken ?? '',
      server: polar.server,
    });
  }

  async createCheckout(input: CreatePolarCheckoutInput): Promise<PolarCheckoutResult> {
    const polarCfg = this.config.get('polar', { infer: true });
    const productId = polarCfg.productId!;

    const checkout = await this.polar.checkouts.create({
      products: [productId],
      prices: {
        [productId]: [
          {
            amountType: 'fixed',
            priceAmount: input.amountCents,
            priceCurrency: input.currency as 'mxn',
          },
        ],
      },
      externalCustomerId: input.customerId,
      metadata: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
      },
      successUrl: polarCfg.successUrl ?? undefined,
      returnUrl: polarCfg.cancelUrl ?? undefined,
    });

    return {
      polarCheckoutId: checkout.id,
      checkoutUrl: checkout.url,
      status: checkout.status,
    };
  }
}
