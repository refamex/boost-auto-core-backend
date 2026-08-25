import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../../../shared/common/decorators/public.decorator';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  ShippingWebhookService,
  SkydropxWebhookPayload,
} from '../../application/services/shipping-webhook.service';
import {
  isValidSkydropxSignature,
  SKYDROPX_SIGNATURE_HEADER,
} from '../skydropx/skydropx-webhook.util';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiExcludeController()
@Controller({ path: 'shipping/webhooks/skydropx', version: '1' })
export class ShippingWebhookController {
  constructor(
    private readonly webhookService: ShippingWebhookService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handle(
    @Req() req: RawBodyRequest,
    @Headers() headers: Record<string, string | string[]>,
  ) {
    const secret = this.config.get('skydropx.webhookSecret', { infer: true });
    if (!secret) {
      throw new UnauthorizedException('Skydropx webhook secret not configured');
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = this.headerValue(headers[SKYDROPX_SIGNATURE_HEADER]);

    if (!isValidSkydropxSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid Skydropx webhook signature');
    }

    await this.webhookService.handle(req.body as SkydropxWebhookPayload);
    return { received: true };
  }

  private headerValue(
    value: string | string[] | undefined,
  ): string | undefined {
    if (value === undefined) return undefined;
    return Array.isArray(value) ? value[0] : value;
  }
}
