import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { OrderItemEntity } from '../../../orders/domain/entities/order-item.entity';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { PolarCheckoutEntity } from '../../../payments/domain/entities/polar-checkout.entity';
import { ProductDimensionEntity } from '../../../pim/domain/entities/product-dimension.entity';
import {
  NoShippingCoverageError,
  ParcelNotComputableError,
} from '../../domain/shipping-errors';
import { SKYDROPX_CLIENT } from '../ports/skydropx.client';
import { ShippingQuoteService } from './shipping-quote.service';

/**
 * The parcel and the price both moved server-side in this change, and these
 * tests are the proof.
 *
 * Two of the old assertions were deleted rather than adapted, because they
 * described behaviour that WAS the defect: that the parcel came from
 * `order.parcel_*` (never populated by anything) and that a caller's `parcel`
 * override was honoured regardless of who the caller was.
 */
describe('ShippingQuoteService', () => {
  const customer: AuthenticatedUser = { id: 'customer-1', roles: ['customer'] };
  const staff: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };

  const baseOrder = (over: Partial<OrderEntity> = {}): OrderEntity =>
    ({
      id: 'order-uuid',
      customerId: 'customer-1',
      shipToStreet1: 'Av. Reforma 100',
      shipToPostalCode: '06600',
      shipToCountryCode: 'MX',
      subtotal: 1000,
      taxTotal: 160,
      discountTotal: 0,
      shippingTotal: 0,
      grandTotal: 1160,
      paymentStatus: 'pending',
      ...over,
    }) as OrderEntity;

  const orderRepo = { findOne: jest.fn(), save: jest.fn((o: unknown) => o) };
  const itemRepo = { find: jest.fn() };
  const dimensionRepo = { find: jest.fn() };
  const checkoutRepo = { findOne: jest.fn() };

  const skydropx = { quote: jest.fn() };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'skydropx.enabled') return true;
      if (key === 'skydropx.origin')
        return { countryCode: 'MX', street1: 'Bodega 1', postalCode: '64000' };
      return undefined;
    }),
  };

  let service: ShippingQuoteService;

  beforeEach(async () => {
    jest.clearAllMocks();

    orderRepo.save.mockImplementation((o: unknown) => Promise.resolve(o));
    checkoutRepo.findOne.mockResolvedValue(null);
    itemRepo.find.mockResolvedValue([
      { productId: 1, qty: 2, skuSnapshot: 'SKU-A' },
    ]);
    dimensionRepo.find.mockResolvedValue([
      { productId: 1, weight: 3, length: 40, width: 30, height: 10 },
    ]);
    skydropx.quote.mockResolvedValue({
      quotationId: 'q-1',
      rates: [
        { rateId: 'r-1', carrierName: 'fedex', amount: 150, currency: 'MXN' },
        { rateId: 'r-2', carrierName: 'dhl', amount: 210, currency: 'MXN' },
      ],
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        ShippingQuoteService,
        { provide: ConfigService, useValue: config },
        { provide: SKYDROPX_CLIENT, useValue: skydropx },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
        { provide: getRepositoryToken(OrderItemEntity), useValue: itemRepo },
        {
          provide: getRepositoryToken(ProductDimensionEntity),
          useValue: dimensionRepo,
        },
        {
          provide: getRepositoryToken(PolarCheckoutEntity),
          useValue: checkoutRepo,
        },
      ],
    }).compile();
    service = moduleRef.get(ShippingQuoteService);
  });

  describe('quoteForOrder', () => {
    it('sizes the parcel from the order lines, not from a fixed box', async () => {
      orderRepo.findOne.mockResolvedValue(baseOrder());
      await service.quoteForOrder('order-uuid', staff);

      // 2 × 3kg, stacked on the 10cm side: 40 × 30 × 20.
      expect(skydropx.quote).toHaveBeenCalledWith(
        expect.objectContaining({
          parcel: { weight: 6, length: 40, width: 30, height: 20 },
        }),
      );
    });

    it('IGNORES a parcel override from a customer', async () => {
      // The whole reason this gate exists: `customer` holds `shipping:read`, so
      // before it any shopper could post a 100g box and buy a cheap rate for a
      // shipment that does not exist.
      orderRepo.findOne.mockResolvedValue(baseOrder());
      await service.quoteForOrder('order-uuid', customer, {
        parcel: { weight: 0.1, length: 1, width: 1, height: 1 },
      });

      expect(skydropx.quote).toHaveBeenCalledWith(
        expect.objectContaining({
          parcel: expect.objectContaining({ weight: 6 }) as unknown,
        }),
      );
    });

    it('honours a complete parcel override from staff', async () => {
      orderRepo.findOne.mockResolvedValue(baseOrder());
      await service.quoteForOrder('order-uuid', staff, {
        parcel: { weight: 12, length: 100, width: 50, height: 40 },
      });

      expect(skydropx.quote).toHaveBeenCalledWith(
        expect.objectContaining({
          parcel: { weight: 12, length: 100, width: 50, height: 40 },
        }),
      );
    });

    it('lays a partial staff override on top of the computed parcel', async () => {
      // "This one ships heavier than the catalogue says" must not also discard
      // the dimensions the catalogue got right.
      orderRepo.findOne.mockResolvedValue(baseOrder());
      await service.quoteForOrder('order-uuid', staff, {
        parcel: { weight: 9 },
      });

      expect(skydropx.quote).toHaveBeenCalledWith(
        expect.objectContaining({
          parcel: { weight: 9, length: 40, width: 30, height: 20 },
        }),
      );
    });

    it('persists the quotation and the offered rates for later selection', async () => {
      const order = baseOrder();
      orderRepo.findOne.mockResolvedValue(order);
      await service.quoteForOrder('order-uuid', staff);

      expect(order.shippingQuotationId).toBe('q-1');
      expect(order.shippingRatesJson).toHaveLength(2);
      expect(orderRepo.save).toHaveBeenCalledWith(order);
    });

    it('does NOT price the order just by quoting it', async () => {
      // Seeing prices is not accepting one. `shipping_quoted_at` stays null, so
      // Polar still refuses to charge.
      const order = baseOrder();
      orderRepo.findOne.mockResolvedValue(order);
      await service.quoteForOrder('order-uuid', staff);

      expect(order.shippingTotal).toBe(0);
      expect(order.grandTotal).toBe(1160);
      expect(order.shippingQuotedAt).toBeUndefined();
    });

    it('reports zero rates as no-coverage, not as a failure', async () => {
      skydropx.quote.mockResolvedValue({ quotationId: 'q-2', rates: [] });
      orderRepo.findOne.mockResolvedValue(baseOrder());

      await expect(service.quoteForOrder('order-uuid', staff)).rejects.toThrow(
        NoShippingCoverageError,
      );
    });

    it('names every SKU with no dimensions on file', async () => {
      itemRepo.find.mockResolvedValue([
        { productId: 1, qty: 1, skuSnapshot: 'SKU-A' },
        { productId: 2, qty: 1, skuSnapshot: 'SKU-B' },
      ]);
      dimensionRepo.find.mockResolvedValue([
        { productId: 1, weight: 3, length: 40, width: 30, height: 10 },
      ]);
      orderRepo.findOne.mockResolvedValue(baseOrder());

      await expect(
        service.quoteForOrder('order-uuid', staff),
      ).rejects.toMatchObject({
        code: 'SHIPPING_MISSING_DIMENSIONS',
        skus: ['SKU-B'],
      });
    });

    it('refuses to re-price while a Polar checkout is open', async () => {
      // That checkout was created with the OLD grand_total and Polar charges
      // the amount it carries, not the one the order ends up with.
      checkoutRepo.findOne.mockResolvedValue({ id: 'chk-1', status: 'open' });
      orderRepo.findOne.mockResolvedValue(baseOrder());

      await expect(service.quoteForOrder('order-uuid', staff)).rejects.toThrow(
        ConflictException,
      );
      expect(skydropx.quote).not.toHaveBeenCalled();
    });

    it('refuses to re-price a paid order', async () => {
      orderRepo.findOne.mockResolvedValue(baseOrder({ paymentStatus: 'paid' }));
      await expect(service.quoteForOrder('order-uuid', staff)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws when shipping is disabled', async () => {
      (config.get as jest.Mock).mockReturnValueOnce(false);
      await expect(service.quoteForOrder('order-uuid', staff)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('404s and never calls Skydropx when the order is not the caller own', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(
        service.quoteForOrder('order-uuid', customer),
      ).rejects.toThrow(NotFoundException);
      expect(skydropx.quote).not.toHaveBeenCalled();
    });

    it('resolves the order through the shared ownership predicate', async () => {
      orderRepo.findOne.mockResolvedValue(baseOrder());
      await service.quoteForOrder('order-uuid', customer);
      expect(orderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: 'order-uuid' },
        }),
      );
    });

    it('400s when the order has no destination address', async () => {
      orderRepo.findOne.mockResolvedValue(
        baseOrder({ shipToStreet1: null, shipToPostalCode: null }),
      );
      await expect(service.quoteForOrder('o', staff)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('selectRate', () => {
    const quoted = baseOrder({
      shippingRatesJson: [
        {
          rateId: 'r-1',
          carrierName: 'fedex',
          serviceLevel: 'express',
          amount: 150,
          currency: 'MXN',
        },
      ],
    });

    it('prices the order with the amount SKYDROPX returned', async () => {
      const order = { ...quoted } as OrderEntity;
      orderRepo.findOne.mockResolvedValue(order);

      await service.selectRate('order-uuid', 'r-1', customer);

      expect(order.shippingTotal).toBe(150);
      expect(order.shippingCarrierName).toBe('fedex');
      expect(order.shippingServiceLevel).toBe('express');
      // 1000 + 160 + 150. This is the number Polar charges, and until this
      // change it was 1160 while the screen said 1310.
      expect(order.grandTotal).toBe(1310);
    });

    it('stamps shippingQuotedAt, which is what unlocks payment', async () => {
      const order = { ...quoted } as OrderEntity;
      orderRepo.findOne.mockResolvedValue(order);

      await service.selectRate('order-uuid', 'r-1', customer);
      expect(order.shippingQuotedAt).toBeInstanceOf(Date);
    });

    it('does not add tax to the freight', async () => {
      // The carrier's price is already final. Taxing it again would invent a
      // charge nobody quoted and break `tax_total` reconciling with the lines.
      const order = { ...quoted } as OrderEntity;
      orderRepo.findOne.mockResolvedValue(order);

      await service.selectRate('order-uuid', 'r-1', customer);
      expect(order.taxTotal).toBe(160);
    });

    it('rejects a rate that was never offered', async () => {
      orderRepo.findOne.mockResolvedValue({ ...quoted } as OrderEntity);
      await expect(
        service.selectRate('order-uuid', 'forged-rate', customer),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects selection on an order that was never quoted', async () => {
      orderRepo.findOne.mockResolvedValue(baseOrder());
      await expect(
        service.selectRate('order-uuid', 'r-1', customer),
      ).rejects.toThrow(ConflictException);
    });

    it('404s when the order is not the caller own', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(
        service.selectRate('order-uuid', 'r-1', customer),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
