import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PolarWebhookService } from './polar-webhook.service';
import { WebhookEventEntity } from '../../domain/entities/webhook-event.entity';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { OrderPaymentEntity } from '../../../orders/domain/entities/order-payment.entity';

describe('PolarWebhookService', () => {
  const webhookRepo = {
    save: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn((x) => x),
  };

  const orderRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const paymentRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn((x) => x),
  };

  const checkoutRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const txRepos = {
    getRepository: jest.fn((entity) => {
      if (entity === OrderEntity) {
        return {
          findOne: jest.fn().mockResolvedValue({
            id: 'order-uuid',
            grandTotal: 50,
            paymentStatus: 'pending',
          }),
          save: jest.fn((o) => Promise.resolve(o)),
        };
      }
      if (entity === PolarCheckoutEntity) {
        return {
          findOne: jest.fn().mockResolvedValue({
            orderId: 'order-uuid',
            polarCheckoutId: 'ch-1',
          }),
          save: jest.fn((c) => Promise.resolve(c)),
          create: jest.fn((x) => x),
        };
      }
      if (entity === OrderPaymentEntity) {
        return {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
          create: jest.fn((x) => x),
        };
      }
      return {};
    }),
  };

  const dataSource = {
    transaction: jest.fn((fn) => fn(txRepos)),
  };

  let service: PolarWebhookService;

  const events = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PolarWebhookService,
        { provide: EventEmitter2, useValue: events },
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(WebhookEventEntity), useValue: webhookRepo },
        { provide: getRepositoryToken(PolarCheckoutEntity), useValue: checkoutRepo },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
        { provide: getRepositoryToken(OrderPaymentEntity), useValue: paymentRepo },
      ],
    }).compile();

    service = moduleRef.get(PolarWebhookService);
  });

  it('processes order.paid and marks order paid', async () => {
    await service.handle({
      type: 'order.paid',
      data: {
        id: 'polar-order-1',
        checkoutId: 'ch-1',
        metadata: { orderId: 'order-uuid' },
        totalAmount: 5000,
      },
    });

    expect(webhookRepo.save).toHaveBeenCalled();
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(webhookRepo.update).toHaveBeenCalledWith(
      { polarEventId: 'order.paid:polar-order-1' },
      expect.objectContaining({ processedAt: expect.any(Date) }),
    );
  });
});
