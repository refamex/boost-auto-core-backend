export const SKYDROPX_CLIENT = Symbol('SKYDROPX_CLIENT');

export interface SkydropxAddress {
  name?: string;
  company?: string;
  street1?: string;
  postalCode?: string;
  areaLevel1?: string;
  areaLevel2?: string;
  areaLevel3?: string;
  countryCode: string;
  phone?: string;
  email?: string;
}

export interface SkydropxParcel {
  weight: number;
  length: number;
  width: number;
  height: number;
}

export interface QuoteInput {
  origin: SkydropxAddress;
  destination: SkydropxAddress;
  parcel: SkydropxParcel;
}

export interface SkydropxRate {
  rateId: string;
  carrierName: string;
  serviceLevel?: string;
  amount: number;
  currency: string;
  estimatedDelivery?: string;
}

export interface QuoteResult {
  quotationId: string;
  rates: SkydropxRate[];
}

export interface CreateShipmentInput {
  quotationId: string;
  rateId: string;
}

export interface ShipmentResult {
  skydropxShipmentId: string;
  status: string;
  carrierName?: string;
  serviceLevel?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  labelUrl?: string;
  amount?: number;
  currency?: string;
}

export interface TrackingEvent {
  status: string;
  description?: string;
  occurredAt?: string;
}

export interface TrackingResult {
  status: string;
  trackingNumber: string;
  events: TrackingEvent[];
}

export interface SkydropxClient {
  quote(input: QuoteInput): Promise<QuoteResult>;
  createShipment(input: CreateShipmentInput): Promise<ShipmentResult>;
  cancelShipment(skydropxShipmentId: string): Promise<void>;
  getTracking(trackingNumber: string, carrierName: string): Promise<TrackingResult>;
}
