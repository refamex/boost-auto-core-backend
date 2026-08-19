import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { ShipmentTrackingEventEntity } from '../../domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from '../../domain/entities/shipment.entity';
import { SKYDROPX_CLIENT } from '../ports/skydropx.client';
import { ShipmentService } from './shipment.service';

describe('ShipmentService', () => {
  const order = { id: 'order-uuid', shippingStatus: 'pending' } as OrderEntity;

  const shipmentRepo = {
    findOne: jest.fn(),
    save: jest.fn((x) => Promise.resolve({ id: 'ship-uuid', ...x })),
    create: jest.fn((x) => x),
  };
  const trackingRepo = {
    findOne: jest.fn(),
    save: jest.fn((x) => Promise.resolve(x)),
    create: jest.fn((x) => x),
  };
  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(order),
    save: jest.fn((x) => Promise.resolve(x)),
  };

  const skydropx = {
    createShipment: jest.fn().mockResolvedValue({
      skydropxShipmentId: 'sky-1',
      status: 'created',
      carrierName: 'fedex',
      trackingNumber: 'TRACK123',
    }),
    cancelShipment: jest.fn().mockResolvedValue(undefined),
    getTracking: jest.fn(),
  };

  const config = { get: jest.fn(() => true) };

  let service: ShipmentService;

  const events = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    config.get.mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShipmentService,
        { provide: EventEmitter2, useValue: events },
        { provide: ConfigService, useValue: config },
        { provide: SKYDROPX_CLIENT, useValue: skydropx },
        { provide: getRepositoryToken(ShipmentEntity), useValue: shipmentRepo },
        { provide: getRepositoryToken(ShipmentTrackingEventEntity), useValue: trackingRepo },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
      ],
    }).compile();
    service = moduleRef.get(ShipmentService);
  });

  it('creates shipment and updates order shippingStatus', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);
    orderRepo.findOne.mockResolvedValue({ ...order });
    const result = await service.createForOrder('order-uuid', 'q-1', 'r-1');
    expect(result.skydropxShipmentId).toBe('sky-1');
    expect(skydropx.createShipment).toHaveBeenCalledWith({ quotationId: 'q-1', rateId: 'r-1' });
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ shippingStatus: 'shipment_created' }),
    );
  });

  it('throws 409 when an active shipment already exists', async () => {
    shipmentRepo.findOne.mockResolvedValue({ id: 'x', status: 'created' });
    orderRepo.findOne.mockResolvedValue({ ...order });
    await expect(service.createForOrder('order-uuid', 'q-1', 'r-1')).rejects.toThrow(
      ConflictException,
    );
  });

  it('cancels a cancellable shipment', async () => {
    shipmentRepo.findOne.mockResolvedValue({
      id: 'ship-uuid',
      orderId: 'order-uuid',
      skydropxShipmentId: 'sky-1',
      status: 'created',
    });
    orderRepo.findOne.mockResolvedValue({ ...order });
    const result = await service.cancel('ship-uuid');
    expect(skydropx.cancelShipment).toHaveBeenCalledWith('sky-1');
    expect(result.status).toBe('cancelled');
  });

  it('throws 409 when cancelling a delivered shipment', async () => {
    shipmentRepo.findOne.mockResolvedValue({
      id: 'ship-uuid',
      skydropxShipmentId: 'sky-1',
      status: 'delivered',
    });
    await expect(service.cancel('ship-uuid')).rejects.toThrow(ConflictException);
  });

  it('throws 404 when shipment not found', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);
    await expect(service.findById('nope')).rejects.toThrow(NotFoundException);
  });
});
