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
  'system',
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
  'system.stock_sync_config_error',
  'system.stock_sync_failed',
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
  'system.stock_sync_config_error': {
    category: 'system',
    title: () => 'Error de configuración en sincronización de stock',
    body: (c) => c.reference, // reference carries the error message
  },
  'system.stock_sync_failed': {
    category: 'system',
    title: () => 'Falló la sincronización de stock de Rough Country',
    body: (c) => c.reference, // reference carries the error message
  },
};

/**
 * Deep link for the feed row.
 *
 * These used to read `/cuenta/pedido/:id` and `/cuenta/facturas/:id` — Spanish
 * paths that no route in the storefront has ever served, so every notification
 * a customer clicked answered 404. The app routes are English (`/orders`,
 * `/account/invoices`); this now matches them.
 *
 * The paths belong to `boost-auto-client-app`. This is the single place that
 * knows them: `NotificationService` recomputes the link on every read rather
 * than trusting the value persisted with the row, so renaming a route there
 * needs this function updated and nothing else.
 */
export function linkFor(
  eventKey: NotificationEventKey,
  entityId: string,
): string | null {
  // Unknown key falls through to no link rather than throwing. The type says
  // this cannot happen, but `event_key` is a plain varchar and this function is
  // now called on rows read back from the table: one row written by an older
  // version, under a key since dropped from the catalogue, would otherwise take
  // down the whole feed instead of losing its own link.
  const template = NOTIFICATION_TEMPLATES[eventKey] as
    | NotificationTemplate
    | undefined;
  if (!template) return null;
  // A system alert references no customer document: its entityId is the feed's
  // job type, not an order, so `/orders/${entityId}` would be another 404.
  // Null is representable end to end — the column is nullable and the
  // storefront's notification handler only navigates when a link is present.
  if (template.category === 'system') return null;
  if (eventKey === 'invoice.available') return `/account/invoices`;
  return `/orders/${entityId}`;
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
