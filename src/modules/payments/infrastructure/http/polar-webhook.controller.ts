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
import {
  validatePolarEvent,
  WebhookVerificationError,
} from '../polar/polar-webhook.util';
import { Public } from '../../../../shared/common/decorators/public.decorator';
import { AppConfig } from '../../../../shared/config/configuration';
import { PolarWebhookService } from '../../application/services/polar-webhook.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@ApiExcludeController()
@Controller({ path: 'payments/webhooks/polar', version: '1' })
export class PolarWebhookController {
  constructor(
    private readonly webhookService: PolarWebhookService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async handle(@Req() req: RawBodyRequest, @Headers() headers: Record<string, string | string[]>) {
    const secret = this.config.get('polar.webhookSecret', { infer: true });
    if (!secret) {
      throw new UnauthorizedException('Polar webhook secret not configured');
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const normalized = this.normalizeHeaders(headers);

    let event;
    try {
      event = validatePolarEvent(rawBody, normalized, secret);
    } catch (e) {
      if (e instanceof WebhookVerificationError) {
        throw new UnauthorizedException('Invalid Polar webhook signature');
      }
      throw e;
    }

    await this.webhookService.handle(event as Parameters<PolarWebhookService['handle']>[0]);
    return { received: true };
  }

  private normalizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      out[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
    return out;
  }
}
