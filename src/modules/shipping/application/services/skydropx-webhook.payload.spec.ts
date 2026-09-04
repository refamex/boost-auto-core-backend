import {
  normalizeSkydropxEvent,
  SkydropxWebhookPayload,
} from './skydropx-webhook.payload';

// Verbatim delivery captured from the Skydropx sandbox: a JSON:API envelope
// with no top-level type and the interesting fields under `attributes`.
const jsonApiOrder: SkydropxWebhookPayload = {
  data: {
    id: '85a37910-858f-49b3-b082-63f39b87048b',
    type: 'orders',
    attributes: {
      status: 'draft',
      platform: 'Shopify',
      platform_id: '3490',
      ecommerce_id: '2',
      price: 6393,
      payment_status: 'paid',
    },
  },
};

describe('normalizeSkydropxEvent', () => {
  it('takes the event type from the JSON:API resource type', () => {
    expect(normalizeSkydropxEvent(jsonApiOrder).eventType).toBe('orders');
  });

  it('builds the idempotency key from the resource type and id', () => {
    expect(normalizeSkydropxEvent(jsonApiOrder).eventId).toBe(
      'orders:85a37910-858f-49b3-b082-63f39b87048b',
    );
  });

  it('lifts status out of attributes when it is not at the data level', () => {
    expect(normalizeSkydropxEvent(jsonApiOrder).status).toBe('draft');
  });

  it('still reads a flat payload with a top-level type and id', () => {
    const event = normalizeSkydropxEvent({
      type: 'tracking.updated',
      id: 'evt-1',
      data: {
        shipment_id: 'sky-1',
        status: 'delivered',
        occurred_at: '2026-05-25T10:00:00Z',
      },
    });

    expect(event).toMatchObject({
      eventId: 'tracking.updated:evt-1',
      eventType: 'tracking.updated',
      shipmentId: 'sky-1',
      status: 'delivered',
      occurredAt: '2026-05-25T10:00:00Z',
    });
  });

  it('reads tracking fields from attributes too', () => {
    const event = normalizeSkydropxEvent({
      data: {
        id: 'sh-1',
        type: 'shipments',
        attributes: {
          tracking_number: 'TRK-9',
          status: 'in_transit',
          description: 'Out of the hub',
          occurred_at: '2026-05-25T10:00:00Z',
        },
      },
    });

    expect(event).toMatchObject({
      eventType: 'shipments',
      trackingNumber: 'TRK-9',
      status: 'in_transit',
      description: 'Out of the hub',
      occurredAt: '2026-05-25T10:00:00Z',
    });
  });

  // event_type is NOT NULL in shipping.webhook_events: an unnamed event has to
  // land on a placeholder instead of taking the whole request down.
  it('falls back to a placeholder type when the payload names none', () => {
    expect(normalizeSkydropxEvent({ data: { id: 'x' } }).eventType).toBe(
      'unknown',
    );
  });

  it('never yields an empty event type for an empty payload', () => {
    expect(normalizeSkydropxEvent({}).eventType).toBe('unknown');
  });

  it('caps the event type at the column width', () => {
    const event = normalizeSkydropxEvent({ type: 'x'.repeat(250) });
    expect(event.eventType).toHaveLength(100);
  });

  // Without an id the key would collapse to "unknown:" for every such event and
  // the unique index would swallow the second one as a duplicate.
  it('falls back to a payload fingerprint when there is no id', () => {
    const first = normalizeSkydropxEvent({ data: { status: 'a' } });
    const second = normalizeSkydropxEvent({ data: { status: 'b' } });

    expect(first.eventId).not.toBe(second.eventId);
    expect(first.eventId.startsWith('unknown:')).toBe(true);
  });

  it('keeps the fingerprint stable for the same payload', () => {
    const payload: SkydropxWebhookPayload = { data: { status: 'a' } };
    expect(normalizeSkydropxEvent(payload).eventId).toBe(
      normalizeSkydropxEvent({ data: { status: 'a' } }).eventId,
    );
  });

  it('coerces a numeric id into the key', () => {
    const event = normalizeSkydropxEvent({
      type: 'shipments',
      data: { id: 3490 as unknown as string },
    });
    expect(event.eventId).toBe('shipments:3490');
  });

  it('survives a payload with no data at all', () => {
    expect(() => normalizeSkydropxEvent({ type: 'ping' })).not.toThrow();
  });
});
