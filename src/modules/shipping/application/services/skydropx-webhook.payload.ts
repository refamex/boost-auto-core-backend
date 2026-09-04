import { createHash } from 'node:crypto';

/**
 * Skydropx entrega sus webhooks con envoltura JSON:API
 * (`{ data: { id, type, attributes } }`), sin `type` en la raíz y con los
 * campos interesantes dentro de `attributes`. El tipo admite además la forma
 * plana por si algún evento llega así.
 */
export type SkydropxWebhookPayload = {
  type?: string;
  id?: string;
  data?: {
    id?: string;
    type?: string;
    shipment_id?: string;
    tracking_number?: string;
    status?: string;
    description?: string;
    occurred_at?: string;
    attributes?: Record<string, unknown>;
  };
};

/** Lo único que el servicio necesita, ya resuelto y siempre presente. */
export type NormalizedSkydropxEvent = {
  eventId: string;
  eventType: string;
  resourceId?: string;
  shipmentId?: string;
  trackingNumber?: string;
  status?: string;
  description?: string;
  occurredAt?: string;
};

// Ancho de shipping.webhook_events.event_type.
const EVENT_TYPE_MAX_LENGTH = 100;
const UNKNOWN_EVENT_TYPE = 'unknown';

/**
 * Aplana el payload de Skydropx. `eventType` nunca queda vacío porque la
 * columna es NOT NULL, y sin id se usa una huella del payload para no colapsar
 * todos los eventos anónimos en la misma clave de idempotencia.
 */
export function normalizeSkydropxEvent(
  payload: SkydropxWebhookPayload,
): NormalizedSkydropxEvent {
  const data = payload.data ?? {};
  const attributes = data.attributes ?? {};

  const eventType = (
    text(payload.type) ??
    text(data.type) ??
    UNKNOWN_EVENT_TYPE
  ).slice(0, EVENT_TYPE_MAX_LENGTH);

  const shipmentId =
    text(data.shipment_id) ?? text(attributes['shipment_id']) ?? undefined;
  const resourceId = text(payload.id) ?? text(data.id) ?? shipmentId;

  return {
    eventId: `${eventType}:${resourceId ?? fingerprint(payload)}`,
    eventType,
    resourceId,
    shipmentId,
    trackingNumber:
      text(data.tracking_number) ?? text(attributes['tracking_number']),
    status: text(data.status) ?? text(attributes['status']),
    description: text(data.description) ?? text(attributes['description']),
    occurredAt: text(data.occurred_at) ?? text(attributes['occurred_at']),
  };
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function fingerprint(payload: SkydropxWebhookPayload): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 32);
}
