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
import { ShippingWebhookService } from '../../application/services/shipping-webhook.service';
import { SkydropxWebhookPayload } from '../../application/services/skydropx-webhook.payload';
import {
  isValidSkydropxWebhookToken,
  SKYDROPX_AUTH_HEADER,
} from '../skydropx/skydropx-webhook.util';

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
    @Req() req: Request,
    @Headers() headers: Record<string, string | string[]>,
  ) {
    const secret = this.config.get('skydropx.webhookSecret', { infer: true });
    if (!secret) {
      throw new UnauthorizedException('Skydropx webhook secret not configured');
    }

    const authHeader = this.headerValue(headers[SKYDROPX_AUTH_HEADER]);

    if (!isValidSkydropxWebhookToken(authHeader, secret)) {
      throw new UnauthorizedException('Invalid Skydropx webhook token');
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
