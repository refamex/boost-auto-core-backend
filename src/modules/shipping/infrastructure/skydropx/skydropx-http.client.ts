import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  CreateShipmentInput,
  QuoteInput,
  QuoteResult,
  ShipmentResult,
  SkydropxAddress,
  SkydropxClient,
  TrackingResult,
} from '../../application/ports/skydropx.client';

const BASE_URLS: Record<'sandbox' | 'production', string> = {
  sandbox: 'https://sb-pro.skydropx.com',
  production: 'https://pro.skydropx.com',
};

// Refrescar el token con margen: expira en 2h, renovamos si quedan <5 min.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

@Injectable()
export class SkydropxHttpClient implements SkydropxClient {
  private readonly logger = new Logger(SkydropxHttpClient.name);
  private cachedToken: CachedToken | null = null;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  private get baseUrl(): string {
    const server = this.config.get('skydropx.server', { infer: true });
    return BASE_URLS[server];
  }

  /** Obtiene un token OAuth2 client_credentials, cacheado en memoria. */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt - TOKEN_REFRESH_MARGIN_MS > now) {
      return this.cachedToken.accessToken;
    }

    const clientId = this.config.get('skydropx.clientId', { infer: true });
    const clientSecret = this.config.get('skydropx.clientSecret', { infer: true });
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException('Skydropx credentials not configured');
    }

    const res = await fetch(`${this.baseUrl}/api/v1/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Skydropx token request failed (${res.status}): ${text}`);
      throw new ServiceUnavailableException('Could not authenticate against Skydropx');
    }

    const json = (await res.json()) as { access_token: string; expires_in?: number };
    const expiresInMs = (json.expires_in ?? 7200) * 1000;
    this.cachedToken = {
      accessToken: json.access_token,
      expiresAt: now + expiresInMs,
    };
    return this.cachedToken.accessToken;
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Skydropx ${method} ${path} failed (${res.status}): ${text}`);
      throw new ServiceUnavailableException(`Skydropx request failed (${res.status})`);
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  private mapAddress(a: SkydropxAddress): Record<string, unknown> {
    return {
      name: a.name,
      company: a.company,
      street1: a.street1,
      postal_code: a.postalCode,
      area_level1: a.areaLevel1,
      area_level2: a.areaLevel2,
      area_level3: a.areaLevel3,
      country_code: a.countryCode,
      phone: a.phone,
      email: a.email,
    };
  }

  async quote(input: QuoteInput): Promise<QuoteResult> {
    const payload = {
      address_from: this.mapAddress(input.origin),
      address_to: this.mapAddress(input.destination),
      parcels: [
        {
          weight: input.parcel.weight,
          length: input.parcel.length,
          width: input.parcel.width,
          height: input.parcel.height,
        },
      ],
    };

    const json = await this.request<{
      id?: string;
      data?: { id?: string };
      rates?: SkydropxRawRate[];
    }>('/api/v1/quotations', 'POST', payload);

    const quotationId = String(json.id ?? json.data?.id ?? '');
    const rawRates = json.rates ?? [];

    return {
      quotationId,
      rates: rawRates.map((r) => ({
        rateId: String(r.id),
        carrierName: r.provider_name ?? r.provider ?? '',
        serviceLevel: r.service_level_name ?? r.service_level,
        amount: Number(r.total ?? r.amount ?? 0),
        currency: r.currency ?? 'MXN',
        estimatedDelivery: r.days ? String(r.days) : undefined,
      })),
    };
  }

  async createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
    const json = await this.request<SkydropxRawShipment>('/api/v1/shipments', 'POST', {
      quotation_id: input.quotationId,
      rate_id: input.rateId,
    });

    const data = json.data ?? json;
    return {
      skydropxShipmentId: String(data.id),
      status: data.status ?? 'created',
      carrierName: data.provider_name ?? data.carrier_name,
      serviceLevel: data.service_level_name ?? data.service_level,
      trackingNumber: data.tracking_number,
      trackingUrl: data.tracking_url,
      labelUrl: data.label_url,
      amount: data.total !== undefined ? Number(data.total) : undefined,
      currency: data.currency,
    };
  }

  async cancelShipment(skydropxShipmentId: string): Promise<void> {
    await this.request<unknown>(
      `/api/v1/shipments/${skydropxShipmentId}/cancellations`,
      'POST',
      {},
    );
  }

  async getTracking(trackingNumber: string, carrierName: string): Promise<TrackingResult> {
    const json = await this.request<{
      status?: string;
      tracking_events?: SkydropxRawTrackingEvent[];
      data?: { status?: string; tracking_events?: SkydropxRawTrackingEvent[] };
    }>(
      `/api/v1/shipments/tracking/${encodeURIComponent(trackingNumber)}/${encodeURIComponent(
        carrierName,
      )}`,
      'GET',
    );

    const data = json.data ?? json;
    const events = data.tracking_events ?? [];
    return {
      status: data.status ?? 'unknown',
      trackingNumber,
      events: events.map((e) => ({
        status: e.status ?? 'unknown',
        description: e.description,
        occurredAt: e.occurred_at ?? e.date,
      })),
    };
  }
}

interface SkydropxRawRate {
  id: string | number;
  provider_name?: string;
  provider?: string;
  service_level_name?: string;
  service_level?: string;
  total?: number | string;
  amount?: number | string;
  currency?: string;
  days?: number | string;
}

interface SkydropxRawShipment {
  id?: string | number;
  status?: string;
  provider_name?: string;
  carrier_name?: string;
  service_level_name?: string;
  service_level?: string;
  tracking_number?: string;
  tracking_url?: string;
  label_url?: string;
  total?: number | string;
  currency?: string;
  data?: SkydropxRawShipment;
}

interface SkydropxRawTrackingEvent {
  status?: string;
  description?: string;
  occurred_at?: string;
  date?: string;
}
