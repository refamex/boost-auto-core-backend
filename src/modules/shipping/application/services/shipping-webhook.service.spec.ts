import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { ShipmentTrackingEventEntity } from '../../domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from '../../domain/entities/shipment.entity';
import { ShippingWebhookEventEntity } from '../../domain/entities/shipping-webhook-event.entity';
import {
  ShippingWebhookService,
  SkydropxWebhookPayload,
} from './shipping-webhook.service';

describe('ShippingWebhookService', () => {
  const webhookRepo = {
    save: jest.fn(),
    create: jest.fn((x: unknown) => x),
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
    webhookRepo.save.mockResolvedValue({});
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

  it('is idempotent: skips on duplicate event id (23505)', async () => {
    const dup = new QueryFailedError('q', [], new Error('dup'));
    (dup as unknown as { code: string }).code = '23505';
    webhookRepo.save.mockRejectedValue(dup);

    await service.handle(event);

    expect(shipmentRepo.findOne).not.toHaveBeenCalled();
    expect(webhookRepo.update).not.toHaveBeenCalled();
  });

  it('no-ops when shipment not found', async () => {
    webhookRepo.save.mockResolvedValue({});
    shipmentRepo.findOne.mockResolvedValue(null);

    await service.handle(event);

    expect(shipmentRepo.save).not.toHaveBeenCalled();
    expect(webhookRepo.update).toHaveBeenCalled();
  });
});
