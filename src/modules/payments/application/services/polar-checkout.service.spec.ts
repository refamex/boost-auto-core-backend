import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { POLAR_CLIENT } from '../ports/polar.client';
import { PolarCheckoutService } from './polar-checkout.service';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';

describe('PolarCheckoutService', () => {
  const customer = { id: 'cust-uuid', roles: ['customer'] };
  const order: OrderEntity = {
    id: 'order-uuid',
    orderNumber: 'ORD-1',
    customerId: 'cust-uuid',
    grandTotal: 100,
    paymentStatus: 'pending',
    // A rate was accepted, so this order is chargeable. Without the stamp the
    // service refuses — see the test at the bottom of this file, which is the
    // whole reason the column exists.
    shippingQuotedAt: new Date('2026-09-03T10:00:00Z'),
  } as OrderEntity;

  const checkoutRepo = {
    findOne: jest.fn(),
    save: jest.fn((x: Record<string, unknown>) =>
      Promise.resolve({ id: 'local-uuid', ...x }),
    ),
    create: jest.fn((x: unknown) => x),
  };

  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(order),
  };

  const polarClient = {
    createCheckout: jest.fn().mockResolvedValue({
      polarCheckoutId: 'polar-ch-1',
      checkoutUrl: 'https://buy.polar.sh/test',
      status: 'open',
    }),
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'polar.enabled') return true;
      if (key === 'polar.currency') return 'mxn';
      return undefined;
    }),
  };

  let service: PolarCheckoutService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PolarCheckoutService,
        { provide: ConfigService, useValue: config },
        { provide: POLAR_CLIENT, useValue: polarClient },
        {
          provide: getRepositoryToken(PolarCheckoutEntity),
          useValue: checkoutRepo,
        },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
      ],
    }).compile();

    service = moduleRef.get(PolarCheckoutService);
  });

  it('creates checkout when none open exists', async () => {
    checkoutRepo.findOne.mockResolvedValue(null);
    const result = await service.createForOrder(order.id, customer);
    expect(result.polarCheckoutId).toBe('polar-ch-1');
    expect(polarClient.createCheckout).toHaveBeenCalled();
  });

  it('refuses to charge an order whose shipping was never quoted', async () => {
    // THE DEFECT THIS CLOSES: quoting was decorative. `grand_total` was
    // `subtotal + tax` and Polar charged exactly that, while the checkout screen
    // displayed a total WITH freight. Every order shipped free, and posting
    // straight to this endpoint skipped the quote screen entirely.
    checkoutRepo.findOne.mockResolvedValue(null);
    orderRepo.findOne.mockResolvedValueOnce({
      ...order,
      shippingQuotedAt: null,
    });

    await expect(service.createForOrder(order.id, customer)).rejects.toThrow(
      ConflictException,
    );
    expect(polarClient.createCheckout).not.toHaveBeenCalled();
  });

  it('throws 409 when open checkout exists', async () => {
    checkoutRepo.findOne.mockResolvedValue({ id: 'existing', status: 'open' });
    await expect(service.createForOrder(order.id, customer)).rejects.toThrow(
      ConflictException,
    );
  });

  it('hides another customer order and does not create its checkout', async () => {
    checkoutRepo.findOne.mockResolvedValue(null);
    const createForOrder = service.createForOrder.bind(service) as unknown as (
      orderId: string,
      user: { id: string; roles: string[] },
    ) => Promise<unknown>;

    await expect(
      createForOrder(order.id, {
        id: 'other-customer',
        roles: ['customer'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(polarClient.createCheckout).not.toHaveBeenCalled();
  });

  it('hides a checkout belonging to another customer order', async () => {
    await expect(
      service.findLatestByOrder(order.id, {
        id: 'other-customer',
        roles: ['customer'],
      }),
    ).rejects.toThrow(NotFoundException);

    expect(checkoutRepo.findOne).not.toHaveBeenCalled();
  });
});
