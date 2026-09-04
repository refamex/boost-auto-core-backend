import {
  NOTIFICATION_EVENT_KEYS,
  NOTIFICATION_TEMPLATES,
  dedupeKeyFor,
  linkFor,
  renderNotification,
} from './notification-event';

describe('notification catalogue', () => {
  it('has a template for every declared event', () => {
    // The catalogue is the one place a new event must be fully described. This
    // fails loudly if somebody adds a key and forgets the copy.
    for (const key of NOTIFICATION_EVENT_KEYS) {
      expect(NOTIFICATION_TEMPLATES[key]).toBeDefined();
    }
    expect(Object.keys(NOTIFICATION_TEMPLATES).sort()).toEqual(
      [...NOTIFICATION_EVENT_KEYS].sort(),
    );
  });

  it('renders every title with the document number inline', () => {
    // System events don't include order references in title
    const systemEvents = [
      'system.stock_sync_config_error',
      'system.stock_sync_failed',
    ];

    for (const key of NOTIFICATION_EVENT_KEYS) {
      const { title } = renderNotification(key, { reference: 'ORD-123' });

      if (!systemEvents.includes(key)) {
        expect(title).toContain('ORD-123');
      }
    }
  });

  it('files payment and invoice events under the invoice category', () => {
    expect(
      renderNotification('payment.received', { reference: 'X' }).category,
    ).toBe('invoice');
    expect(
      renderNotification('invoice.available', { reference: 'X' }).category,
    ).toBe('invoice');
    expect(
      renderNotification('order.placed', { reference: 'X' }).category,
    ).toBe('order');
  });
});

describe('renderNotification', () => {
  it('puts the tracking number in the body when there is one', () => {
    const { body } = renderNotification('shipment.created', {
      reference: 'ORD-1',
      trackingNumber: 'TRACK123',
      carrierName: 'fedex',
    });
    expect(body).toContain('TRACK123');
    expect(body).toContain('fedex');
  });

  it('falls back to generic copy when the carrier gave no tracking number', () => {
    const { body } = renderNotification('shipment.created', {
      reference: 'ORD-1',
    });
    expect(body).toBe('Ya generamos la guía de envío.');
  });

  it('returns null rather than an empty body', () => {
    // in_transit builds its body from the tracking number alone; with none the
    // result must be null so the UI does not render a blank second line.
    const { body } = renderNotification('shipment.in_transit', {
      reference: 'ORD-1',
    });
    expect(body).toBeNull();
  });

  it('omits a body for events that have none', () => {
    expect(
      renderNotification('shipment.delivered', { reference: 'ORD-1' }).body,
    ).toBeNull();
  });
});

describe('dedupeKeyFor', () => {
  it('is stable for the same event, entity and recipient', () => {
    expect(dedupeKeyFor('payment.received', 'order-1', 'user-1')).toBe(
      dedupeKeyFor('payment.received', 'order-1', 'user-1'),
    );
  });

  it('separates different recipients of the same event', () => {
    expect(dedupeKeyFor('payment.received', 'order-1', 'user-1')).not.toBe(
      dedupeKeyFor('payment.received', 'order-1', 'user-2'),
    );
  });

  it('separates different events on the same entity', () => {
    expect(dedupeKeyFor('order.placed', 'order-1', 'user-1')).not.toBe(
      dedupeKeyFor('order.confirmed', 'order-1', 'user-1'),
    );
  });
});

describe('linkFor', () => {
  it('points invoice notifications at the invoice', () => {
    expect(linkFor('invoice.available', 'inv-1')).toBe('/account/invoices');
  });

  it('points order notifications at the order', () => {
    expect(linkFor('shipment.delivered', 'ord-1')).toBe('/orders/ord-1');
    expect(linkFor('payment.received', 'ord-1')).toBe('/orders/ord-1');
  });

  it('gives system alerts no link at all', () => {
    // Their entity id is the feed's job type, not a document the customer can
    // open, so `/orders/rough-country-stock` would be one more 404.
    expect(
      linkFor('system.stock_sync_failed', 'rough-country-stock'),
    ).toBeNull();
    expect(
      linkFor('system.stock_sync_config_error', 'rough-country-stock'),
    ).toBeNull();
  });

  it('never points at a Spanish path the storefront does not serve', () => {
    // The original defect: every stored link read `/cuenta/...`, and no route
    // in boost-auto-client-app has ever answered one.
    for (const key of NOTIFICATION_EVENT_KEYS) {
      const link = linkFor(key, 'entity-1');
      // Null is a legitimate answer (system alerts); a `/cuenta/` path is not.
      expect(link === null || !link.startsWith('/cuenta/')).toBe(true);
    }
  });
});
