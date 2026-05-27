export interface CreatePolarCheckoutInput {
  orderId: string;
  orderNumber: string;
  customerId: string;
  amountCents: number;
  currency: string;
}

export interface PolarCheckoutResult {
  polarCheckoutId: string;
  checkoutUrl: string;
  status: string;
}

export const POLAR_CLIENT = Symbol('POLAR_CLIENT');

export interface PolarClient {
  createCheckout(input: CreatePolarCheckoutInput): Promise<PolarCheckoutResult>;
}
