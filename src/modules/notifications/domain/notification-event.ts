/**
 * The notification catalogue.
 *
 * Every notifiable moment is declared here with its feed category and its copy.
 * Keeping the four decisions — key, category, title, link — in one table means a
 * new event cannot be added while forgetting one of them, and it keeps Spanish
 * user-facing copy out of the services that emit.
 */

/**
 * Feed categories. These are the four groups the customer UI already switches an
 * icon on (Package / ReceiptText / TriangleAlert / Tag), so the frontend needs no
 * mapping table of its own.
 */
export const NOTIFICATION_CATEGORIES = [
  'order',
  'invoice',
  'credit',
  'promo',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_EVENT_KEYS = [
  'order.placed',
  'order.confirmed',
  'order.preparing',
  'order.cancelled',
  'payment.received',
  'payment.refunded',
  'shipment.created',
  'shipment.in_transit',
  'shipment.out_for_delivery',
  'shipment.delivered',
  'shipment.exception',
  'invoice.available',
] as const;
export type NotificationEventKey = (typeof NOTIFICATION_EVENT_KEYS)[number];

/** What the renderer is given. Every field is optional except the reference number. */
export interface NotificationContext {
  /** Human-facing document number: ORD-…, INV-… */
  reference: string;
  trackingNumber?: string | null;
  carrierName?: string | null;
}

export interface NotificationTemplate {
  category: NotificationCategory;
  /** One pre-rendered Spanish sentence carrying the document number inline. */
  title: (ctx: NotificationContext) => string;
  /** Optional second line. The customer feed renders it under the title. */
  body?: (ctx: NotificationContext) => string;
}

export const NOTIFICATION_TEMPLATES: Record<
  NotificationEventKey,
  NotificationTemplate
> = {
  'order.placed': {
    category: 'order',
    title: (c) => `Recibimos tu pedido ${c.reference}`,
    body: () => 'Te avisamos en cuanto confirmemos el pago.',
  },
  'order.confirmed': {
    category: 'order',
    title: (c) => `Tu pedido ${c.reference} fue confirmado`,
    body: () => 'Ya apartamos tus productos.',
  },
  'order.preparing': {
    category: 'order',
    title: (c) => `Estamos preparando tu pedido ${c.reference}`,
    body: () => 'Lo tendremos listo para enviar en breve.',
  },
  'order.cancelled': {
    category: 'order',
    title: (c) => `Tu pedido ${c.reference} fue cancelado`,
  },
  'payment.received': {
    category: 'invoice',
    title: (c) => `Recibimos tu pago del pedido ${c.reference}`,
  },
  'payment.refunded': {
    category: 'invoice',
    title: (c) => `Reembolsamos tu pedido ${c.reference}`,
  },
  'shipment.created': {
    category: 'order',
    title: (c) => `Tu pedido ${c.reference} va en camino`,
    body: (c) =>
      c.trackingNumber
        ? `Guía ${c.trackingNumber}${c.carrierName ? ` · ${c.carrierName}` : ''}`
        : 'Ya generamos la guía de envío.',
  },
  'shipment.in_transit': {
    category: 'order',
    title: (c) => `Tu pedido ${c.reference} está en tránsito`,
    body: (c) => (c.trackingNumber ? `Guía ${c.trackingNumber}` : ''),
  },
  'shipment.out_for_delivery': {
    category: 'order',
    title: (c) => `Tu pedido ${c.reference} está en reparto`,
    body: () => 'Llega hoy.',
  },
  'shipment.delivered': {
    category: 'order',
    title: (c) => `Tu pedido ${c.reference} fue entregado`,
  },
  'shipment.exception': {
    category: 'order',
    // Deliberately not alarming: the customer can do nothing about a carrier
    // incident, so the copy points at the one thing that helps — contacting us.
    title: (c) =>
      `Hubo una incidencia con el envío de tu pedido ${c.reference}`,
    body: () => 'Estamos revisándolo con la paquetería.',
  },
  'invoice.available': {
    category: 'invoice',
    title: (c) => `Tu factura ${c.reference} ya está disponible`,
  },
};

/** Deep link for the feed row. The customer UI has no slot for this yet, but the
 * API carries it so the rows can become clickable without a contract change. */
export function linkFor(
  eventKey: NotificationEventKey,
  entityId: string,
): string {
  return NOTIFICATION_TEMPLATES[eventKey].category === 'invoice' &&
    eventKey === 'invoice.available'
    ? `/cuenta/facturas/${entityId}`
    : `/cuenta/pedido/${entityId}`;
}

export function renderNotification(
  eventKey: NotificationEventKey,
  ctx: NotificationContext,
): { category: NotificationCategory; title: string; body: string | null } {
  const template = NOTIFICATION_TEMPLATES[eventKey];
  const body = template.body?.(ctx)?.trim();
  return {
    category: template.category,
    title: template.title(ctx),
    body: body ? body : null,
  };
}

/**
 * Idempotency key for a notification.
 *
 * Upstream retries are a fact of life here: Polar and Skydropx both redeliver
 * webhooks, and the existing dedupe on those tables is not airtight. Keying the
 * feed row on (event, entity, recipient) means a redelivery updates nothing
 * rather than showing the customer the same message twice.
 */
export function dedupeKeyFor(
  eventKey: NotificationEventKey,
  entityId: string,
  recipientUserId: string,
): string {
  return `${eventKey}:${entityId}:${recipientUserId}`;
}
