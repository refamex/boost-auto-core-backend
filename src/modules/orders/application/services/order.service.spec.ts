import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { ProfileIncompleteError } from '../../domain/order-errors';
import { OrderItemEntity } from '../../domain/entities/order-item.entity';
import { OrderStatusEventEntity } from '../../domain/entities/order-status-event.entity';
import { OrderEntity } from '../../domain/entities/order.entity';
import { round2 } from '../../domain/order-pricing';
import { CreateOrderDto } from '../../infrastructure/http/dto/order.dto';
import { OrderService } from './order.service';

const ORDER_ID = 'order-1';
const TAX_RATE = 0.16;
/** What `pim.product.price` says for product 1 unless a test overrides it. */
const CATALOGUE_PRICE = 100;

/**
 * `profileComplete` is set because these suites are about pricing and
 * ownership, not about onboarding. Without it every one of them would fail on
 * the customer-profile gate — which is the gate doing its job, and is asserted
 * on its own in the `create: customer profile gate` block below.
 */
const customer: AuthenticatedUser = {
  id: 'customer-1',
  roles: [],
  profileComplete: true,
};
const staff: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };

function makeOrder(over: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: ORDER_ID,
    orderNumber: 'ORD-1',
    customerId: 'customer-1',
    status: 'draft',
    items: [],
    ...over,
  } as OrderEntity;
}

function makeCreateDto(over: Partial<CreateOrderDto> = {}): CreateOrderDto {
  return {
    customerId: 'customer-1',
    items: [{ productId: 1, qty: 1, unitPrice: 100 }],
    ...over,
  };
}

describe('OrderService', () => {
  const orderRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    merge: jest.fn((existing: object, dto: object) => ({
      ...existing,
      ...dto,
    })),
  };
  const paymentRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const productRepo = {
    find: jest
      .fn()
      .mockResolvedValue([{ id: 1, sku: 'SKU-1', name: 'Widget' }]),
  };
  // `create`/`createInternal` run inside `this.dataSource.transaction`,
  // which hands the callback a `tx` exposing `getRepository` — same shape
  // `quote.service.spec.ts` uses for its own transactional save.
  const orderTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) =>
      Promise.resolve({ id: ORDER_ID, ...(x as object) }),
    ),
    findOne: jest.fn(),
  };
  const itemTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const statusEventTxRepo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
  };
  const statusEventRepo = {
    find: jest.fn(),
  };
  const txRepos = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === OrderEntity) return orderTxRepo;
      if (entity === OrderStatusEventEntity) return statusEventTxRepo;
      return itemTxRepo;
    }),
  };
  const dataSource = {
    transaction: jest.fn((fn: (t: unknown) => unknown) => fn(txRepos)),
  };
  const reserveStock = { execute: jest.fn() };
  // Was `{}` before. `reserveForOrder` only reaches the stock use case after
  // resolving each item through this port, so leaving it unimplemented made
  // the confirmed-status branch unobservable from a test.
  const inventoryRepo = { findBySkuAndBranch: jest.fn() };
  const events = { emit: jest.fn() };
  const priceLists = { findApplicableOrNull: jest.fn() };
  const priceListItems = { tryResolveApplicablePrice: jest.fn() };
  const profiles = { findByAuthCustomerId: jest.fn() };
  const config = { get: jest.fn(() => TAX_RATE) };

  let service: OrderService;

  // `persist` re-fetches the row after saving and reserves stock only when
  // that readback says `confirmed`. Pointing `findOne` at a hardcoded status
  // decouples the readback from what was actually written, which makes any
  // assertion about the reservation branch pass regardless of the persisted
  // status. This mirrors the readback to the last saved payload instead.
  function readBackPersistedOrder(): void {
    orderTxRepo.findOne.mockImplementation(() => {
      const saved = orderTxRepo.save.mock.calls.at(-1)?.[0] as
        | Partial<OrderEntity>
        | undefined;
      return Promise.resolve(
        makeOrder({
          status: saved?.status ?? 'draft',
          // Both required for `reserveForOrder` to get as far as the stock
          // use case; without them it returns early and a confirmed order
          // would look identical to a draft one.
          providerBranchId: 7,
          items: [{ skuSnapshot: 'SKU-1', qty: 1 }],
        } as Partial<OrderEntity>),
      );
    });
  }

  /** The order payload handed to the transactional save, whatever it was. */
  const persistedOrder = (): Partial<OrderEntity> =>
    orderTxRepo.create.mock.calls.at(-1)?.[0] as Partial<OrderEntity>;

  /** The order item rows handed to the transactional save. */
  const persistedItems = (): Partial<OrderItemEntity>[] =>
    itemTxRepo.save.mock.calls.at(-1)?.[0] as Partial<OrderItemEntity>[];

  beforeEach(() => {
    jest.clearAllMocks();
    productRepo.find.mockResolvedValue([
      { id: 1, sku: 'SKU-1', name: 'Widget', price: CATALOGUE_PRICE },
    ]);
    // Default: a catalogue with no price lists at all, so pricing falls back
    // to pim.product.price. Tests that care override these two.
    priceLists.findApplicableOrNull.mockResolvedValue(null);
    priceListItems.tryResolveApplicablePrice.mockResolvedValue(null);
    profiles.findByAuthCustomerId.mockResolvedValue(null);
    inventoryRepo.findBySkuAndBranch.mockResolvedValue({ id: 10 });
    orderTxRepo.findOne.mockResolvedValue(makeOrder());
    service = new OrderService(
      orderRepo as never,
      {} as never,
      paymentRepo as never,
      productRepo as never,
      dataSource as never,
      reserveStock as never,
      {} as never,
      inventoryRepo as never,
      events as never,
      priceLists as never,
      priceListItems as never,
      config as never,
      statusEventRepo as never,
      profiles as never,
    );
  });

  describe('list', () => {
    it('short-circuits to an empty page without querying when the requested customerId is not the caller own', async () => {
      const result = await service.list(customer, {
        customerId: 'someone-else',
      });
      expect(result).toEqual([]);
      expect(orderRepo.find).not.toHaveBeenCalled();
    });

    it('queries scoped by the shared ownership predicate otherwise', async () => {
      orderRepo.find.mockResolvedValue([makeOrder()]);
      await service.list(customer, {});
      expect(orderRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1' } }),
      );
    });
  });

  describe('findById', () => {
    it('returns 404, never a forbidden error, when ownership excludes the row', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.findById(ORDER_ID, customer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('applies the same predicate list uses', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder());
      await service.findById(ORDER_ID, customer);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: ORDER_ID },
        }),
      );
    });
  });

  describe('create', () => {
    it('binds a customer caller to their own id and forces draft, ignoring dto.status, and never reserves stock (F8)', async () => {
      readBackPersistedOrder();

      await service.create(makeCreateDto({ status: 'confirmed' }), customer);

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'customer-1', status: 'draft' }),
      );
      expect(reserveStock.execute).not.toHaveBeenCalled();
    });

    /**
     * "No podrá realizar pedidos" — the whole point of the change.
     *
     * Read from the token: auth owns the customer profile and mints
     * `profile_complete` next to the identity claims this service already
     * trusts, so there is no HTTP hop to auth on the order path.
     */
    describe('customer profile gate', () => {
      const incomplete: AuthenticatedUser = { id: 'customer-1', roles: [] };

      it('refuses a customer whose profile is incomplete, and writes no row', async () => {
        await expect(
          service.create(makeCreateDto(), incomplete),
        ).rejects.toMatchObject({
          code: 'CUSTOMER_PROFILE_INCOMPLETE',
          httpStatus: 409,
        });
        expect(orderTxRepo.save).not.toHaveBeenCalled();
      });

      it('treats a token minted before the claim existed as incomplete', async () => {
        // Omission is the safe direction: a shopper is asked to fill in a form,
        // rather than buying with no fiscal data on file.
        await expect(
          service.create(makeCreateDto(), {
            id: 'customer-1',
            roles: [],
            profileComplete: undefined,
          }),
        ).rejects.toThrow(ProfileIncompleteError);
      });

      it('lets a customer with a complete profile through', async () => {
        readBackPersistedOrder();
        await service.create(makeCreateDto(), customer);
        expect(orderTxRepo.save).toHaveBeenCalled();
      });

      it('never gates an employee, complete profile or not', async () => {
        // An employee is not a customer and has no fiscal profile to fill in.
        readBackPersistedOrder();
        await service.create(makeCreateDto(), {
          id: 'customer-1',
          roles: [],
          employeeId: 'employee-9',
        });
        expect(orderTxRepo.save).toHaveBeenCalled();
      });

      it('never gates staff', async () => {
        readBackPersistedOrder();
        await service.create(
          makeCreateDto({ customerId: 'someone-else' }),
          staff,
        );
        expect(orderTxRepo.save).toHaveBeenCalled();
      });

      it('does NOT gate createInternal — a rep converting a quote', async () => {
        // That order belongs to a customer who may be a prospect with no
        // account at all, so gating the shared `persist()` would break the B2B
        // path this check has nothing to do with.
        readBackPersistedOrder();
        await service.createInternal(makeCreateDto());
        expect(orderTxRepo.save).toHaveBeenCalled();
      });

      it('runs the check before any pricing lookup', async () => {
        // A blocked order should cost nothing: no product load, no price list.
        productRepo.find.mockClear();
        await expect(
          service.create(makeCreateDto(), incomplete),
        ).rejects.toThrow(ProfileIncompleteError);
        expect(productRepo.find).not.toHaveBeenCalled();
      });
    });

    it('rejects a customer supplying a mismatching customerId with 403, and writes no row (F10)', async () => {
      await expect(
        service.create(makeCreateDto({ customerId: 'someone-else' }), customer),
      ).rejects.toThrow(ForbiddenException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });

    it('throws 403 when called with no actor at all', async () => {
      await expect(
        service.create(
          makeCreateDto(),
          undefined as unknown as AuthenticatedUser,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });

    it('lets staff keep explicit control of customerId and status, unchanged', async () => {
      readBackPersistedOrder();

      await service.create(
        makeCreateDto({ customerId: 'someone-else' }),
        staff,
      );

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'someone-else',
          status: 'draft',
        }),
      );
    });

    // The staff case above passes a DTO with no status, so `draft` is what
    // `bindCreate` defaults to anyway — it cannot tell whether `persist`
    // actually threads the bound status through. This one can: it is the
    // only test where the expected status differs from the default.
    it('carries a staff-supplied non-default status through to the persisted row and into the reservation branch', async () => {
      readBackPersistedOrder();

      await service.create(
        makeCreateDto({ customerId: 'someone-else', status: 'confirmed' }),
        staff,
      );

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'someone-else',
          status: 'confirmed',
        }),
      );
      expect(reserveStock.execute).toHaveBeenCalled();
    });
  });

  // The hole this module was built to close: totals used to be whatever the
  // request body said, and `PolarCheckoutService` charges `grandTotal` verbatim.
  describe('create: server-side pricing', () => {
    beforeEach(() => readBackPersistedOrder());

    it('rejects a client claiming a price the server does not agree with, and writes no row', async () => {
      await expect(
        service.create(
          makeCreateDto({ items: [{ productId: 1, qty: 1, unitPrice: 0.01 }] }),
          customer,
        ),
      ).rejects.toThrow(ConflictException);

      expect(orderTxRepo.save).not.toHaveBeenCalled();
      expect(itemTxRepo.save).not.toHaveBeenCalled();
    });

    it('names the product in the conflict so a stale cart knows what to refresh', async () => {
      await expect(
        service.create(
          makeCreateDto({ items: [{ productId: 1, qty: 1, unitPrice: 0.01 }] }),
          customer,
        ),
      ).rejects.toThrow(/SKU-1/);
    });

    it('prices from the catalogue when the caller asserts nothing', async () => {
      await service.create(
        makeCreateDto({ items: [{ productId: 1, qty: 2 }] }),
        customer,
      );

      expect(persistedItems()[0]).toMatchObject({
        unitPriceSnapshot: CATALOGUE_PRICE,
        qty: 2,
        taxSnapshot: 32, // 200 * 0.16
        lineTotal: 232,
      });
      expect(persistedOrder()).toMatchObject({
        subtotal: 200,
        taxTotal: 32,
        grandTotal: 232,
      });
    });

    it('ignores a customer-tier body priceListCode and prices from the profile', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({
        priceListCode: 'STANDARD',
      });
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-std',
        code: 'STANDARD',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue({ price: 90 });

      await service.create(
        makeCreateDto({
          priceListCode: 'WHOLESALE',
          items: [{ productId: 1, qty: 1 }],
        }),
        customer,
      );

      expect(profiles.findByAuthCustomerId).toHaveBeenCalledWith('customer-1');
      expect(priceLists.findApplicableOrNull).toHaveBeenCalledWith('STANDARD');
      expect(persistedItems()[0]).toMatchObject({ unitPriceSnapshot: 90 });
    });

    it('lets staff name a list even when the document customer is assigned another', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({
        priceListCode: 'STANDARD',
      });
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-vip',
        code: 'VIP',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue({ price: 70 });

      await service.create(
        makeCreateDto({
          priceListCode: 'VIP',
          items: [{ productId: 1, qty: 1 }],
        }),
        staff,
      );

      expect(priceLists.findApplicableOrNull).toHaveBeenCalledWith('VIP');
      expect(persistedItems()[0]).toMatchObject({ unitPriceSnapshot: 70 });
    });

    it('prices staff-omitted code from the document customer profile', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({ priceListCode: 'VIP' });
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-vip',
        code: 'VIP',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue({ price: 70 });

      await service.create(
        makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
        staff,
      );

      expect(profiles.findByAuthCustomerId).toHaveBeenCalledWith('customer-1');
      expect(priceLists.findApplicableOrNull).toHaveBeenCalledWith('VIP');
      expect(persistedItems()[0]).toMatchObject({ unitPriceSnapshot: 70 });
    });

    it('still sells on the catalogue when the profile has no assigned list', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({ priceListCode: null });
      await service.create(
        makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
        customer,
      );
      expect(priceLists.findApplicableOrNull).toHaveBeenCalledWith(undefined);
      expect(persistedItems()[0]).toMatchObject({
        unitPriceSnapshot: CATALOGUE_PRICE,
      });
    });

    it('returns 404 when the assigned list does not exist', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({
        priceListCode: 'GHOST',
      });
      priceLists.findApplicableOrNull.mockImplementation((code?: string) =>
        code === 'GHOST'
          ? Promise.reject(new NotFoundException(`PriceList ${code} not found`))
          : Promise.resolve(null),
      );
      await expect(
        service.create(
          makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
          customer,
        ),
      ).rejects.toThrow(NotFoundException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });

    it('resolves the price list once per order, not once per line', async () => {
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-1',
        code: 'RETAIL',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue({ price: 50 });
      productRepo.find.mockResolvedValue([
        { id: 1, sku: 'SKU-1', name: 'Widget', price: CATALOGUE_PRICE },
        { id: 2, sku: 'SKU-2', name: 'Gadget', price: CATALOGUE_PRICE },
      ]);

      await service.create(
        makeCreateDto({
          items: [
            { productId: 1, qty: 1 },
            { productId: 2, qty: 1 },
          ],
        }),
        customer,
      );

      expect(priceLists.findApplicableOrNull).toHaveBeenCalledTimes(1);
      expect(priceListItems.tryResolveApplicablePrice).toHaveBeenCalledTimes(2);
    });

    it('falls back to pim.product.price when the list does not cover the product', async () => {
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-1',
        code: 'RETAIL',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue(null);

      await service.create(
        makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
        customer,
      );

      expect(persistedItems()[0]).toMatchObject({
        unitPriceSnapshot: CATALOGUE_PRICE,
      });
    });

    it('refuses with 422 when neither the list nor the catalogue prices the product', async () => {
      productRepo.find.mockResolvedValue([
        { id: 1, sku: 'SKU-1', name: 'Widget', price: null },
      ]);

      await expect(
        service.create(
          makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
          customer,
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });

    it('ignores a tax amount in the request body and computes its own', async () => {
      await service.create(
        makeCreateDto({
          items: [{ productId: 1, qty: 1, tax: 9999 }],
        }),
        customer,
      );

      expect(persistedItems()[0]).toMatchObject({ taxSnapshot: 16 });
      expect(persistedOrder()).toMatchObject({ taxTotal: 16 });
    });

    it('reads the rate from config rather than hardcoding one', async () => {
      config.get.mockReturnValue(0.08);

      await service.create(
        makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
        customer,
      );

      expect(persistedItems()[0]).toMatchObject({ taxSnapshot: 8 });
      config.get.mockReturnValue(TAX_RATE);
    });

    it('keeps subtotal + taxTotal exactly equal to grandTotal across many lines', async () => {
      productRepo.find.mockResolvedValue([
        { id: 1, sku: 'SKU-1', name: 'Widget', price: 33.33 },
        { id: 2, sku: 'SKU-2', name: 'Gadget', price: 10.99 },
      ]);

      await service.create(
        makeCreateDto({
          items: [
            { productId: 1, qty: 7 },
            { productId: 2, qty: 3 },
          ],
        }),
        customer,
      );

      // 7 * 33.33 = 233.31 (+37.33 tax); 3 * 10.99 = 32.97 (+5.28 tax)
      expect(persistedOrder()).toMatchObject({
        subtotal: 266.28,
        taxTotal: 42.61,
        grandTotal: 308.89,
      });
      // Raw `subtotal + taxTotal` is 308.89000000000004 in binary floating
      // point, which is exactly why grandTotal goes through round2.
      const order = persistedOrder();
      expect(round2(order.subtotal! + order.taxTotal!)).toBe(order.grandTotal);
    });
  });

  describe('preview', () => {
    it('ignores a customer-tier body priceListCode', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({
        priceListCode: 'STANDARD',
      });
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-std',
        code: 'STANDARD',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue({ price: 90 });

      const result = await service.preview(
        {
          customerId: 'customer-1',
          priceListCode: 'WHOLESALE',
          items: [{ productId: 1, qty: 1 }],
        },
        customer,
      );

      expect(priceLists.findApplicableOrNull).toHaveBeenCalledWith('STANDARD');
      expect(result.items[0]).toMatchObject({
        unitPrice: 90,
        source: 'price-list',
      });
    });

    it('lets staff name a list on preview even when the document customer is assigned another', async () => {
      profiles.findByAuthCustomerId.mockResolvedValue({
        priceListCode: 'STANDARD',
      });
      priceLists.findApplicableOrNull.mockResolvedValue({
        id: 'list-vip',
        code: 'VIP',
      });
      priceListItems.tryResolveApplicablePrice.mockResolvedValue({ price: 70 });

      const result = await service.preview(
        {
          customerId: 'customer-1',
          priceListCode: 'VIP',
          items: [{ productId: 1, qty: 1 }],
        },
        staff,
      );

      expect(priceLists.findApplicableOrNull).toHaveBeenCalledWith('VIP');
      expect(result.items[0]).toMatchObject({
        unitPrice: 70,
        source: 'price-list',
      });
    });
  });

  describe('createInternal', () => {
    it('applies no ownership binding and defaults no contact email (Defect B)', async () => {
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await service.createInternal(
        makeCreateDto({ customerId: 'quote-customer' }),
      );

      expect(orderTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'quote-customer',
          shipToEmail: undefined,
        }),
      );
    });

    // A quote is an approved, negotiated document. Re-pricing it at conversion
    // would discard the price the customer accepted, so the trusted in-process
    // entry point keeps the snapshot QuoteService already resolved server-side.
    it('keeps the quote snapshot instead of re-pricing against the catalogue', async () => {
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await service.createInternal(
        makeCreateDto({
          customerId: 'quote-customer',
          items: [{ productId: 1, qty: 2, unitPrice: 42.5, tax: 13.6 }],
        }),
      );

      expect(persistedItems()[0]).toMatchObject({
        unitPriceSnapshot: 42.5,
        taxSnapshot: 13.6,
        lineTotal: 98.6,
      });
      expect(persistedOrder()).toMatchObject({
        subtotal: 85,
        taxTotal: 13.6,
        grandTotal: 98.6,
      });
      expect(priceLists.findApplicableOrNull).not.toHaveBeenCalled();
      expect(priceListItems.tryResolveApplicablePrice).not.toHaveBeenCalled();
    });

    it('refuses a snapshot line with no unit price rather than persisting a free order', async () => {
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await expect(
        service.createInternal(
          makeCreateDto({ items: [{ productId: 1, qty: 1 }] }),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(orderTxRepo.save).not.toHaveBeenCalled();
    });
  });

  // Trap verification (task 6.3): each of the five internal write callers
  // must still resolve the order through the unscoped `loadForWrite` path —
  // a plain `findOne({ where: { id } })`, not `loadVisible`'s ownership filter.
  describe('internal write callers still resolve unscoped', () => {
    beforeEach(() => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ providerBranchId: 1 }));
    });

    it('update', async () => {
      await service.update(ORDER_ID, { status: 'draft' });
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('confirm', async () => {
      await service.confirm(ORDER_ID);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('prepare', async () => {
      orderRepo.findOne.mockResolvedValue(
        makeOrder({ status: 'confirmed', providerBranchId: 1 }),
      );
      await service.prepare(ORDER_ID);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('cancel', async () => {
      await service.cancel(ORDER_ID);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });

    it('addPayment', async () => {
      await service.addPayment(ORDER_ID, { amount: 100, status: 'pending' });
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ORDER_ID } }),
      );
    });
  });

  /**
   * The audit asked for the lifecycle stepper to show who moved an order. The
   * cause sat upstream of the UI: nothing recorded an actor, so there was no
   * data to draw.
   */
  describe('status history', () => {
    beforeEach(() => {
      statusEventTxRepo.create.mockClear();
      statusEventTxRepo.save.mockClear();
    });

    const staff = {
      id: 'staff-1',
      email: 'ana@boost.mx',
      roles: ['orders:write'],
    };

    it('records who confirmed an order', async () => {
      const order = makeOrder({ status: 'draft', providerBranchId: 1 });
      orderRepo.findOne.mockResolvedValue(order);
      orderTxRepo.findOne.mockResolvedValue(order);

      await service.confirm(ORDER_ID, staff);

      expect(statusEventTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: ORDER_ID,
          fromStatus: 'draft',
          toStatus: 'confirmed',
          actorId: 'staff-1',
          actorEmail: 'ana@boost.mx',
        }),
      );
    });

    it('records the transition when an order is cancelled', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await service.cancel(ORDER_ID, staff);

      expect(statusEventTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'cancelled', actorId: 'staff-1' }),
      );
    });

    /**
     * The Polar webhook confirms orders with no user context at all. Refusing
     * the transition, or inventing an actor to satisfy a constraint, would both
     * be worse than recording honestly that the system did it.
     */
    it('records a null actor rather than refusing a transition with no caller', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await expect(service.cancel(ORDER_ID)).resolves.toBeDefined();

      expect(statusEventTxRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ actorId: null, actorEmail: null }),
      );
    });

    /**
     * THE assertion this feature turns on. The event and the status change go
     * through the same `dataSource.transaction`, so a history row can never
     * describe a transition that did not happen — nor a transition go
     * unrecorded.
     */
    it('writes the event through the same transaction as the status change', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));

      await service.cancel(ORDER_ID, staff);

      expect(txRepos.getRepository).toHaveBeenCalledWith(
        OrderStatusEventEntity,
      );
      expect(statusEventTxRepo.save).toHaveBeenCalled();
    });

    it('leaves no history behind when the status change fails', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));
      orderTxRepo.findOne.mockResolvedValue(makeOrder({ status: 'draft' }));
      orderTxRepo.save.mockRejectedValueOnce(new Error('write conflict'));

      await expect(service.cancel(ORDER_ID, staff as never)).rejects.toThrow(
        'write conflict',
      );

      expect(statusEventTxRepo.save).not.toHaveBeenCalled();
    });

    it('refuses to record anything when the transition is rejected', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder({ status: 'cancelled' }));

      await expect(service.confirm(ORDER_ID, staff as never)).rejects.toThrow(
        /cancelled/,
      );

      expect(statusEventTxRepo.save).not.toHaveBeenCalled();
    });

    it('reads the history oldest first, scoped like the order itself', async () => {
      orderRepo.findOne.mockResolvedValue(makeOrder());
      statusEventRepo.find.mockResolvedValue([]);

      await service.listStatusEvents(ORDER_ID, customer);

      expect(statusEventRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: ORDER_ID },
          order: { occurredAt: 'ASC' },
        }),
      );
    });
  });
});
