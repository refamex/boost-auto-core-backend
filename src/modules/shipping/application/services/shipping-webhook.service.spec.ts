import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { ShipmentTrackingEventEntity } from '../../domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from '../../domain/entities/shipment.entity';
import { ShippingWebhookEventEntity } from '../../domain/entities/shipping-webhook-event.entity';
import { ShippingWebhookService } from './shipping-webhook.service';
import { SkydropxWebhookPayload } from './skydropx-webhook.payload';

type InsertQbMock = {
  insert: () => InsertQbMock;
  into: () => InsertQbMock;
  values: (v: unknown) => InsertQbMock;
  orIgnore: () => InsertQbMock;
  returning: () => InsertQbMock;
  updateEntity: () => InsertQbMock;
  execute: jest.Mock;
};

describe('ShippingWebhookService', () => {
  // insertIfNew() writes through the query builder: ON CONFLICT DO NOTHING
  // returns the new row, or nothing at all when the event already landed.
  const insertExecute = jest.fn();
  const insertValues = jest.fn();
  const insertQb: InsertQbMock = {
    insert: () => insertQb,
    into: () => insertQb,
    values: (v: unknown) => {
      insertValues(v);
      return insertQb;
    },
    orIgnore: () => insertQb,
    returning: () => insertQb,
    updateEntity: () => insertQb,
    execute: insertExecute,
  };

  const webhookRepo = {
    target: ShippingWebhookEventEntity,
    metadata: { primaryColumns: [{ databaseName: 'id' }] },
    createQueryBuilder: jest.fn(() => insertQb),
    update: jest.fn(),
  };
  const shipmentRepo = {
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const trackingRepo = {
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
  };
  const orderRepo = {
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };

  let service: ShippingWebhookService;

  const event: SkydropxWebhookPayload = {
    type: 'tracking.updated',
    id: 'evt-1',
    data: {
      shipment_id: 'sky-1',
      status: 'delivered',
      occurred_at: '2026-05-25T10:00:00Z',
    },
  };

  const events = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    insertExecute.mockResolvedValue({ raw: [{ id: 'webhook-row' }] });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShippingWebhookService,
        { provide: EventEmitter2, useValue: events },
        {
          provide: getRepositoryToken(ShippingWebhookEventEntity),
          useValue: webhookRepo,
        },
        { provide: getRepositoryToken(ShipmentEntity), useValue: shipmentRepo },
        {
          provide: getRepositoryToken(ShipmentTrackingEventEntity),
          useValue: trackingRepo,
        },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
      ],
    }).compile();
    service = moduleRef.get(ShippingWebhookService);
  });

  it('records event, updates shipment + order, marks processed', async () => {
    shipmentRepo.findOne.mockResolvedValue({
      id: 'ship-uuid',
      orderId: 'order-uuid',
      status: 'created',
    });
    orderRepo.findOne.mockResolvedValue({
      id: 'order-uuid',
      shippingStatus: 'in_transit',
    });

    await service.handle(event);

    expect(shipmentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'delivered' }),
    );
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ shippingStatus: 'delivered' }),
    );
    expect(trackingRepo.save).toHaveBeenCalled();
    expect(webhookRepo.update).toHaveBeenCalledWith(
      { skydropxEventId: 'tracking.updated:evt-1' },
      expect.objectContaining({ processedAt: expect.any(Date) as unknown }),
    );
  });

  it('is idempotent: skips an event that was already recorded', async () => {
    insertExecute.mockResolvedValue({ raw: [] });

    await service.handle(event);

    expect(shipmentRepo.findOne).not.toHaveBeenCalled();
    expect(webhookRepo.update).not.toHaveBeenCalled();
  });

  it('no-ops when shipment not found', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);

    await service.handle(event);

    expect(shipmentRepo.save).not.toHaveBeenCalled();
    expect(webhookRepo.update).toHaveBeenCalled();
  });

  // Real Skydropx deliveries arrive JSON:API-wrapped, with no top-level type.
  // Persisting a null event_type violates the NOT NULL and 500s the webhook.
  describe('JSON:API deliveries', () => {
    const orderEvent: SkydropxWebhookPayload = {
      data: {
        id: '85a37910-858f-49b3-b082-63f39b87048b',
        type: 'orders',
        attributes: { status: 'draft', payment_status: 'paid' },
      },
    };

    it('persists the resource type instead of a null event type', async () => {
      shipmentRepo.findOne.mockResolvedValue(null);

      await service.handle(orderEvent);

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'orders',
          skydropxEventId: 'orders:85a37910-858f-49b3-b082-63f39b87048b',
        }),
      );
    });

    it('acknowledges an event that matches no shipment', async () => {
      shipmentRepo.findOne.mockResolvedValue(null);

      await expect(service.handle(orderEvent)).resolves.toBeUndefined();
      expect(trackingRepo.save).not.toHaveBeenCalled();
      expect(webhookRepo.update).toHaveBeenCalled();
    });

    it('applies a status carried under attributes', async () => {
      shipmentRepo.findOne.mockResolvedValue({
        id: 'ship-uuid',
        orderId: 'order-uuid',
        status: 'created',
      });
      orderRepo.findOne.mockResolvedValue({
        id: 'order-uuid',
        shippingStatus: 'created',
      });

      await service.handle({
        data: {
          id: 'sky-1',
          type: 'shipments',
          attributes: { status: 'in_transit' },
        },
      });

      expect(shipmentRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'in_transit' }),
      );
      expect(orderRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ shippingStatus: 'in_transit' }),
      );
    });

    it('stores the raw payload untouched', async () => {
      shipmentRepo.findOne.mockResolvedValue(null);

      await service.handle(orderEvent);

      expect(insertValues).toHaveBeenCalledWith(
        expect.objectContaining({ payloadJson: orderEvent }),
      );
    });
  });
});
