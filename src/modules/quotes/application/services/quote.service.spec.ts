import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { PriceListItemService } from '../../../commerce/application/services/price-list-item.service';
import { PriceListService } from '../../../commerce/application/services/price-list.service';
import { OrderService } from '../../../orders/application/services/order.service';
import { CreateOrderDto } from '../../../orders/infrastructure/http/dto/order.dto';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import { QuoteItemEntity } from '../../domain/entities/quote-item.entity';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import { QuoteService } from './quote.service';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const REP_ID = '22222222-2222-4222-8222-222222222222';
const QUOTE_ID = '33333333-3333-4333-8333-333333333333';
const TAX_RATE = 0.16;

const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: ['quotes:write'],
  salesRepId: REP_ID,
};
const customer: AuthenticatedUser = { id: CUSTOMER_ID, roles: ['quotes:read'] };

const FUTURE = new Date(Date.now() + 15 * 24 * 3600 * 1000);
const PAST = new Date(Date.now() - 24 * 3600 * 1000);

const priceList = {
  id: 'list-1',
  code: 'MAYOREO',
  currency: 'MXN',
  isDefault: true,
};

function makeQuote(over: Partial<QuoteEntity> = {}): QuoteEntity {
  return {
    id: QUOTE_ID,
    quoteNumber: 'QUO-1',
    customerId: CUSTOMER_ID,
    salesRepId: REP_ID,
    priceListId: 'list-1',
    currency: 'MXN',
    status: 'draft',
    validUntil: FUTURE,
    subtotal: 12500,
    taxTotal: 2000,
    grandTotal: 14500,
    items: [
      {
        productId: 42,
        qty: 10,
        unitPriceSnapshot: 1250,
        taxSnapshot: 2000,
        lineTotal: 14500,
      },
    ],
    ...over,
  } as QuoteEntity;
}

describe('QuoteService', () => {
  const quoteRepo = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    update: jest.fn(),
    remove: jest.fn(),
  };
  const productRepo = {
    find: jest
      .fn()
      .mockResolvedValue([{ id: 42, sku: 'RC-1234', name: 'Lift Kit' }]),
  };

  // The transaction callback receives repositories keyed by entity class, the
  // same shape polar-webhook.service.spec.ts uses.
  const quoteTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x) =>
      Promise.resolve(Array.isArray(x) ? x : { id: QUOTE_ID, ...x }),
    ),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const itemTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    delete: jest.fn(),
  };
  const txRepos = {
    getRepository: jest.fn((entity: unknown) =>
      entity === QuoteEntity ? quoteTxRepo : itemTxRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(txRepos)),
  };

  const priceLists = { findApplicable: jest.fn(), findById: jest.fn() };
  const priceListItems = { resolveApplicablePrice: jest.fn() };
  const orders = { create: jest.fn(), createInternal: jest.fn() };
  const config = { get: jest.fn(() => TAX_RATE) };

  // Jest hands mock arguments back as `any`; narrow them once here instead of
  // sprinkling casts through the assertions.
  const savedQuoteItems = (): Partial<QuoteItemEntity>[] => {
    const calls = itemTxRepo.save.mock.calls as unknown as [
      Partial<QuoteItemEntity>[],
    ][];
    return calls[0][0];
  };
  const convertedOrderPayload = (): CreateOrderDto => {
    const calls = orders.createInternal.mock.calls as unknown as [
      CreateOrderDto,
    ][];
    return calls[0][0];
  };

  let service: QuoteService;

  beforeEach(async () => {
    jest.clearAllMocks();
    priceLists.findApplicable.mockResolvedValue(priceList);
    priceLists.findById.mockResolvedValue(priceList);
    priceListItems.resolveApplicablePrice.mockResolvedValue({
      id: 'tier-10',
      price: 1250,
    });
    productRepo.find.mockResolvedValue([
      { id: 42, sku: 'RC-1234', name: 'Lift Kit' },
    ]);
    quoteTxRepo.findOne.mockResolvedValue(makeQuote());

    const moduleRef = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: getRepositoryToken(QuoteEntity), useValue: quoteRepo },
        { provide: getRepositoryToken(ProductEntity), useValue: productRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: PriceListService, useValue: priceLists },
        { provide: PriceListItemService, useValue: priceListItems },
        { provide: OrderService, useValue: orders },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(QuoteService);
  });

  const createDto = {
    customerId: CUSTOMER_ID,
    validUntil: FUTURE,
    items: [{ productId: 42, qty: 10 }],
  };

  describe('create', () => {
    it('prices lines from the price list, never from the request', async () => {
      await service.create(rep, createDto);
      expect(priceListItems.resolveApplicablePrice).toHaveBeenCalledWith(
        'list-1',
        42,
        10,
        expect.any(Date),
      );
      expect(savedQuoteItems()[0]).toMatchObject({
        unitPriceSnapshot: 1250,
        priceListItemId: 'tier-10',
      });
    });

    it('snapshots sku and name so a catalog edit cannot rewrite the quote', async () => {
      await service.create(rep, createDto);
      expect(savedQuoteItems()[0]).toMatchObject({
        skuSnapshot: 'RC-1234',
        nameSnapshot: 'Lift Kit',
      });
    });

    it('totals qty * resolved price plus server-computed tax', async () => {
      await service.create(rep, createDto);
      expect(quoteTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 12500,
          taxTotal: 2000, // 12500 * 0.16
          grandTotal: 14500,
        }),
      );
    });

    // A rep could otherwise quote tax 0, get it approved, and convert it into
    // an order carrying that snapshot — reopening the order hole from inside.
    it('ignores a tax amount in the request and computes its own', async () => {
      await service.create(rep, {
        ...createDto,
        items: [{ productId: 42, qty: 10, tax: 0 }],
      });
      expect(savedQuoteItems()[0]).toMatchObject({ taxSnapshot: 2000 });
      expect(quoteTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ taxTotal: 2000, grandTotal: 14500 }),
      );
    });

    it('reads the rate from config rather than hardcoding one', async () => {
      config.get.mockReturnValue(0.08);
      await service.create(rep, createDto);
      expect(savedQuoteItems()[0]).toMatchObject({ taxSnapshot: 1000 });
      config.get.mockReturnValue(TAX_RATE);
    });

    it('starts as a draft owned by the calling rep', async () => {
      await service.create(rep, createDto);
      expect(quoteTxRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'draft', salesRepId: REP_ID }),
      );
    });

    it('rejects the whole quote with 422 when a line has no applicable price', async () => {
      priceListItems.resolveApplicablePrice.mockRejectedValue(
        new NotFoundException('no applicable price for product 42'),
      );
      await expect(service.create(rep, createDto)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('still reports a missing product as 404', async () => {
      productRepo.find.mockResolvedValue([]);
      await expect(service.create(rep, createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('refuses a caller with no sales rep claim', async () => {
      await expect(service.create(customer, createDto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('lifecycle', () => {
    it('sends a draft', async () => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'draft' }));
      const sent = await service.send(QUOTE_ID, rep);
      expect(sent.status).toBe('sent');
    });

    it('refuses to approve a draft that was never sent', async () => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'draft' }));
      await expect(service.approve(QUOTE_ID, rep)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to send a quote twice', async () => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'sent' }));
      await expect(service.send(QUOTE_ID, rep)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to act on a rejected quote', async () => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'rejected' }));
      await expect(service.approve(QUOTE_ID, rep)).rejects.toThrow(
        ConflictException,
      );
    });

    it('refuses to approve an expired quote', async () => {
      quoteRepo.findOne.mockResolvedValue(
        makeQuote({ status: 'sent', validUntil: PAST }),
      );
      await expect(service.approve(QUOTE_ID, rep)).rejects.toThrow(/expired/);
    });

    it('never persists expired as a status', async () => {
      quoteRepo.findOne.mockResolvedValue(
        makeQuote({ status: 'sent', validUntil: PAST }),
      );
      await expect(service.approve(QUOTE_ID, rep)).rejects.toThrow(
        ConflictException,
      );
      expect(quoteRepo.save).not.toHaveBeenCalled();
    });

    it('reads back a lapsed sent quote as expired without writing it', async () => {
      quoteRepo.findOne.mockResolvedValue(
        makeQuote({ status: 'sent', validUntil: PAST }),
      );
      const view = await service.findById(QUOTE_ID, rep);
      expect(view.status).toBe('expired');
      expect(quoteRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('editing', () => {
    it('refuses to edit a quote that was already sent', async () => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'sent' }));
      await expect(
        service.update(QUOTE_ID, rep, { notes: 'x' }),
      ).rejects.toThrow(ConflictException);
    });

    it('re-prices the lines when a draft is edited', async () => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'draft' }));
      await service.update(QUOTE_ID, rep, {
        items: [{ productId: 42, qty: 20 }],
      });
      expect(priceListItems.resolveApplicablePrice).toHaveBeenCalledWith(
        'list-1',
        42,
        20,
        expect.any(Date),
      );
    });
  });

  describe('convert', () => {
    beforeEach(() => {
      quoteRepo.findOne.mockResolvedValue(makeQuote({ status: 'approved' }));
      quoteRepo.update.mockResolvedValue({ affected: 1 });
      orders.createInternal.mockResolvedValue({ id: 'order-1' });
    });

    it('claims the quote before creating the order', async () => {
      await service.convert(QUOTE_ID, rep);
      const claimCallIndex = quoteRepo.update.mock.invocationCallOrder[0];
      const createCallIndex = orders.createInternal.mock.invocationCallOrder[0];
      // Claim-first is what makes two concurrent converts unable to produce two
      // orders. Creating first and marking after would not.
      expect(claimCallIndex).toBeLessThan(createCallIndex);
    });

    it('hands the order the snapshotted prices, not a re-resolved one', async () => {
      await service.convert(QUOTE_ID, rep);
      expect(orders.createInternal).toHaveBeenCalledWith(
        expect.objectContaining({
          items: [
            expect.objectContaining({
              productId: 42,
              qty: 10,
              unitPrice: 1250,
            }),
          ],
        }),
      );
      expect(priceListItems.resolveApplicablePrice).not.toHaveBeenCalled();
    });

    it('creates a draft order with no provider branch, so no stock is reserved', async () => {
      await service.convert(QUOTE_ID, rep);
      const payload = convertedOrderPayload();
      expect(payload.status).toBe('draft');
      expect(payload.providerBranchId).toBeUndefined();
    });

    it('records the resulting order on the quote', async () => {
      await service.convert(QUOTE_ID, rep);
      expect(quoteRepo.update).toHaveBeenLastCalledWith(
        { id: QUOTE_ID },
        { convertedOrderId: 'order-1' },
      );
    });

    it('refuses a second conversion and creates no second order', async () => {
      quoteRepo.update.mockResolvedValue({ affected: 0 });
      await expect(service.convert(QUOTE_ID, rep)).rejects.toThrow(
        ConflictException,
      );
      expect(orders.createInternal).not.toHaveBeenCalled();
    });

    // Defect B regression (F11): threading the acting rep into the
    // actor-bound `create` would freeze the rep's email onto the customer's
    // order and misroute every future notification for it. `convert` must
    // go through the in-process, no-actor `createInternal` entry point.
    it('creates the order in-process for the quote customer, never through the actor-bound entry point', async () => {
      await service.convert(QUOTE_ID, rep);
      const payload = convertedOrderPayload();
      expect(payload.customerId).toBe(CUSTOMER_ID);
      expect(payload.customerId).not.toBe(rep.id);
      expect(orders.createInternal).toHaveBeenCalledTimes(1);
      expect(orders.create).not.toHaveBeenCalled();
    });

    it('sets no shipToEmail on the payload, so the acting rep address cannot leak onto the order', async () => {
      await service.convert(QUOTE_ID, rep);
      const payload = convertedOrderPayload();
      expect(payload.shipToEmail).toBeUndefined();
    });

    it('succeeds when the acting rep id differs from the quote customerId', async () => {
      await expect(service.convert(QUOTE_ID, rep)).resolves.toEqual(
        expect.objectContaining({ id: QUOTE_ID }),
      );
    });
  });

  describe('visibility', () => {
    it('answers 404, not 403, when the quote is not the caller to see', async () => {
      quoteRepo.findOne.mockResolvedValue(null);
      await expect(service.findById(QUOTE_ID, rep)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('gives a customer an empty page instead of refusing a draft filter', async () => {
      const page = await service.list(customer, {
        status: 'draft',
        page: 1,
        limit: 25,
        skip: 0,
      });
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      expect(quoteRepo.findAndCount).not.toHaveBeenCalled();
    });
  });
});
