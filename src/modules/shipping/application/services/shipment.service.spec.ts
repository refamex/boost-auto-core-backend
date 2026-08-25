import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { ShipmentTrackingEventEntity } from '../../domain/entities/shipment-tracking-event.entity';
import { ShipmentEntity } from '../../domain/entities/shipment.entity';
import { SKYDROPX_CLIENT } from '../ports/skydropx.client';
import { ShipmentService } from './shipment.service';

describe('ShipmentService', () => {
  const order = { id: 'order-uuid', shippingStatus: 'pending' } as OrderEntity;

  const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };
  const staff: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };

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
        {
          provide: getRepositoryToken(ShipmentTrackingEventEntity),
          useValue: trackingRepo,
        },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
      ],
    }).compile();
    service = moduleRef.get(ShipmentService);
  });

  it('creates shipment and updates order shippingStatus', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);
    orderRepo.findOne.mockResolvedValue({ ...order });
    const result = await service.createForOrder(
      'order-uuid',
      'q-1',
      'r-1',
      staff,
    );
    expect(result.skydropxShipmentId).toBe('sky-1');
    expect(skydropx.createShipment).toHaveBeenCalledWith({
      quotationId: 'q-1',
      rateId: 'r-1',
    });
    expect(orderRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ shippingStatus: 'shipment_created' }),
    );
  });

  it('throws 409 when an active shipment already exists', async () => {
    shipmentRepo.findOne.mockResolvedValue({ id: 'x', status: 'created' });
    orderRepo.findOne.mockResolvedValue({ ...order });
    await expect(
      service.createForOrder('order-uuid', 'q-1', 'r-1', staff),
    ).rejects.toThrow(ConflictException);
  });

  it('resolves the order through the ownership predicate before buying a label', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);
    orderRepo.findOne.mockResolvedValue({ ...order });
    await service.createForOrder('order-uuid', 'q-1', 'r-1', customer);
    expect(orderRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'customer-1', id: 'order-uuid' },
      }),
    );
  });

  it('404s and buys no label when the order is not the caller own', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);
    orderRepo.findOne.mockResolvedValue(null);
    await expect(
      service.createForOrder('order-uuid', 'q-1', 'r-1', customer),
    ).rejects.toThrow(NotFoundException);
    expect(skydropx.createShipment).not.toHaveBeenCalled();
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
    await expect(service.cancel('ship-uuid')).rejects.toThrow(
      ConflictException,
    );
  });

  // F9: `cancel` deliberately takes NO caller. It is staff-only behind
  // `@Roles('shipping:write')`, and scoping it guards nothing reachable
  // while it could break a non-admin operator holding that permission.
  it('cancel resolves the shipment UNSCOPED, with no ownership key', async () => {
    shipmentRepo.findOne.mockResolvedValue({
      id: 'ship-uuid',
      orderId: 'order-uuid',
      skydropxShipmentId: 'sky-1',
      status: 'created',
    });
    orderRepo.findOne.mockResolvedValue({ ...order });
    await service.cancel('ship-uuid');
    expect(shipmentRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ship-uuid' } }),
    );
  });

  it('throws 404 when shipment not found', async () => {
    shipmentRepo.findOne.mockResolvedValue(null);
    await expect(service.getTracking('nope', customer)).rejects.toThrow(
      NotFoundException,
    );
  });

  describe('getTracking ownership', () => {
    const shipment = {
      id: 'ship-uuid',
      orderId: 'order-uuid',
      trackingNumber: 'TRACK123',
      carrierName: 'fedex',
      status: 'created',
    };

    // Asserts the two messages against EACH OTHER, not against a literal.
    // `rejects.toThrow(<string>)` is a SUBSTRING match, so an ownership error
    // that merely appends a reason would satisfy a literal expectation while
    // restoring the existence oracle this guarantee exists to prevent.
    it('404s with a message byte-identical to a missing shipment, so neither confirms the other', async () => {
      shipmentRepo.findOne.mockResolvedValue(null);
      const missing = await service
        .getTracking('ship-uuid', customer)
        .then(() => null)
        .catch((e: NotFoundException) => e);

      shipmentRepo.findOne.mockResolvedValue(shipment);
      orderRepo.findOne.mockResolvedValue(null);
      const foreign = await service
        .getTracking('ship-uuid', customer)
        .then(() => null)
        .catch((e: NotFoundException) => e);

      expect(missing).toBeInstanceOf(NotFoundException);
      expect(foreign).toBeInstanceOf(NotFoundException);
      expect(foreign?.message).toBe(missing?.message);
      expect(skydropx.getTracking).not.toHaveBeenCalled();
    });

    it('resolves the owning order through the shared predicate', async () => {
      shipmentRepo.findOne.mockResolvedValue(shipment);
      orderRepo.findOne.mockResolvedValue({ ...order });
      skydropx.getTracking.mockResolvedValue({ status: 'created', events: [] });
      await service.getTracking('ship-uuid', customer);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: 'order-uuid' },
        }),
      );
    });
  });

  describe('findByOrder ownership', () => {
    // Same shape as the tracking case: the two throws in `findByOrder` are
    // deliberately identical so the endpoint cannot be used to learn whether
    // a foreign order exists. Compared against each other, never a literal.
    it('404s without reading the shipment table, with a message identical to an order that simply has no shipment', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      const foreign = await service
        .findByOrder('order-uuid', customer)
        .then(() => null)
        .catch((e: NotFoundException) => e);
      expect(shipmentRepo.findOne).not.toHaveBeenCalled();

      orderRepo.findOne.mockResolvedValue({ ...order });
      shipmentRepo.findOne.mockResolvedValue(null);
      const noShipment = await service
        .findByOrder('order-uuid', customer)
        .then(() => null)
        .catch((e: NotFoundException) => e);

      expect(foreign).toBeInstanceOf(NotFoundException);
      expect(noShipment).toBeInstanceOf(NotFoundException);
      expect(foreign?.message).toBe(noShipment?.message);
    });

    it('returns the latest shipment once ownership admits the order', async () => {
      orderRepo.findOne.mockResolvedValue({ ...order });
      shipmentRepo.findOne.mockResolvedValue({
        id: 'ship-uuid',
        orderId: 'order-uuid',
      });
      const found = await service.findByOrder('order-uuid', customer);
      expect(found.id).toBe('ship-uuid');
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: 'order-uuid' },
        }),
      );
    });
  });
});
