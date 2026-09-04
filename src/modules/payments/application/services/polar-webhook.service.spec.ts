import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PolarWebhookService } from './polar-webhook.service';
import { WebhookEventEntity } from '../../domain/entities/webhook-event.entity';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { OrderPaymentEntity } from '../../../orders/domain/entities/order-payment.entity';

type InsertQbMock = {
  insert: () => InsertQbMock;
  into: () => InsertQbMock;
  values: (v: unknown) => InsertQbMock;
  orIgnore: () => InsertQbMock;
  returning: () => InsertQbMock;
  updateEntity: () => InsertQbMock;
  execute: jest.Mock;
};

describe('PolarWebhookService', () => {
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
    target: WebhookEventEntity,
    metadata: { primaryColumns: [{ databaseName: 'id' }] },
    createQueryBuilder: jest.fn(() => insertQb),
    update: jest.fn().mockResolvedValue({}),
  };

  const orderRepo = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const paymentRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
    create: jest.fn((x: unknown) => x),
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
          save: jest.fn((o: unknown) => Promise.resolve(o)),
        };
      }
      if (entity === PolarCheckoutEntity) {
        return {
          findOne: jest.fn().mockResolvedValue({
            orderId: 'order-uuid',
            polarCheckoutId: 'ch-1',
          }),
          save: jest.fn((c: unknown) => Promise.resolve(c)),
          create: jest.fn((x: unknown) => x),
        };
      }
      if (entity === OrderPaymentEntity) {
        return {
          findOne: jest.fn().mockResolvedValue(null),
          save: jest.fn(),
          create: jest.fn((x: unknown) => x),
        };
      }
      return {};
    }),
  };

  const dataSource = {
    transaction: jest.fn((fn: (repos: typeof txRepos) => unknown) =>
      fn(txRepos),
    ),
  };

  let service: PolarWebhookService;

  const events = { emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    insertExecute.mockResolvedValue({ raw: [{ id: 'webhook-row' }] });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PolarWebhookService,
        { provide: EventEmitter2, useValue: events },
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(WebhookEventEntity),
          useValue: webhookRepo,
        },
        {
          provide: getRepositoryToken(PolarCheckoutEntity),
          useValue: checkoutRepo,
        },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
        {
          provide: getRepositoryToken(OrderPaymentEntity),
          useValue: paymentRepo,
        },
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

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ polarEventId: 'order.paid:polar-order-1' }),
    );
    expect(dataSource.transaction).toHaveBeenCalled();
    expect(webhookRepo.update).toHaveBeenCalledWith(
      { polarEventId: 'order.paid:polar-order-1' },
      expect.objectContaining({ processedAt: expect.any(Date) as unknown }),
    );
  });

  // The unique index is the idempotency guard; ON CONFLICT DO NOTHING makes it
  // return an empty result instead of raising 23505 into the logs.
  it('skips an event that was already recorded, without touching the order', async () => {
    insertExecute.mockResolvedValue({ raw: [] });

    await service.handle({
      type: 'order.paid',
      data: { id: 'polar-order-1', metadata: { orderId: 'order-uuid' } },
    });

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(webhookRepo.update).not.toHaveBeenCalled();
  });
});
