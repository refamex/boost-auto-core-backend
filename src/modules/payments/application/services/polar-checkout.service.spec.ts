import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { POLAR_CLIENT } from '../ports/polar.client';
import { PolarCheckoutService } from './polar-checkout.service';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';

describe('PolarCheckoutService', () => {
  const order: OrderEntity = {
    id: 'order-uuid',
    orderNumber: 'ORD-1',
    customerId: 'cust-uuid',
    grandTotal: 100,
    paymentStatus: 'pending',
  } as OrderEntity;

  const checkoutRepo = {
    findOne: jest.fn(),
    save: jest.fn((x) => Promise.resolve({ id: 'local-uuid', ...x })),
    create: jest.fn((x) => x),
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
        { provide: getRepositoryToken(PolarCheckoutEntity), useValue: checkoutRepo },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
      ],
    }).compile();

    service = moduleRef.get(PolarCheckoutService);
  });

  it('creates checkout when none open exists', async () => {
    checkoutRepo.findOne.mockResolvedValue(null);
    const result = await service.createForOrder(order.id);
    expect(result.polarCheckoutId).toBe('polar-ch-1');
    expect(polarClient.createCheckout).toHaveBeenCalled();
  });

  it('throws 409 when open checkout exists', async () => {
    checkoutRepo.findOne.mockResolvedValue({ id: 'existing', status: 'open' });
    await expect(service.createForOrder(order.id)).rejects.toThrow(ConflictException);
  });
});
