import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { SKYDROPX_CLIENT } from '../ports/skydropx.client';
import { ShippingQuoteService } from './shipping-quote.service';

describe('ShippingQuoteService', () => {
  const fullOrder = {
    id: 'order-uuid',
    shipToStreet1: 'Av. Reforma 100',
    shipToPostalCode: '06600',
    shipToCountryCode: 'MX',
    parcelWeight: 2,
    parcelLength: 30,
    parcelWidth: 20,
    parcelHeight: 10,
  } as OrderEntity;

  const orderRepo = { findOne: jest.fn() };

  const skydropx = {
    quote: jest.fn().mockResolvedValue({
      quotationId: 'q-1',
      rates: [{ rateId: 'r-1', carrierName: 'fedex', amount: 150, currency: 'MXN' }],
    }),
  };

  const config = {
    get: jest.fn((key: string) => {
      if (key === 'skydropx.enabled') return true;
      if (key === 'skydropx.origin') return { countryCode: 'MX', street1: 'Bodega 1', postalCode: '64000' };
      return undefined;
    }),
  };

  let service: ShippingQuoteService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ShippingQuoteService,
        { provide: ConfigService, useValue: config },
        { provide: SKYDROPX_CLIENT, useValue: skydropx },
        { provide: getRepositoryToken(OrderEntity), useValue: orderRepo },
      ],
    }).compile();
    service = moduleRef.get(ShippingQuoteService);
  });

  it('quotes using order destination + parcel', async () => {
    orderRepo.findOne.mockResolvedValue(fullOrder);
    const result = await service.quoteForOrder('order-uuid');
    expect(result.quotationId).toBe('q-1');
    expect(skydropx.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: expect.objectContaining({ postalCode: '06600' }),
        parcel: expect.objectContaining({ weight: 2 }),
      }),
    );
  });

  it('throws when shipping disabled', async () => {
    (config.get as jest.Mock).mockReturnValueOnce(false);
    await expect(service.quoteForOrder('order-uuid')).rejects.toThrow(ServiceUnavailableException);
  });

  it('throws 404 when order not found', async () => {
    orderRepo.findOne.mockResolvedValue(null);
    await expect(service.quoteForOrder('missing')).rejects.toThrow(NotFoundException);
  });

  it('throws 400 when destination address missing', async () => {
    orderRepo.findOne.mockResolvedValue({ id: 'o', parcelWeight: 2, parcelLength: 1, parcelWidth: 1, parcelHeight: 1 } as OrderEntity);
    await expect(service.quoteForOrder('o')).rejects.toThrow(BadRequestException);
  });

  it('throws 400 when parcel dimensions missing', async () => {
    orderRepo.findOne.mockResolvedValue({
      id: 'o',
      shipToStreet1: 'x',
      shipToPostalCode: '00000',
    } as OrderEntity);
    await expect(service.quoteForOrder('o')).rejects.toThrow(BadRequestException);
  });

  it('applies request override over order data', async () => {
    orderRepo.findOne.mockResolvedValue(fullOrder);
    await service.quoteForOrder('order-uuid', { parcel: { weight: 5 } });
    expect(skydropx.quote).toHaveBeenCalledWith(
      expect.objectContaining({ parcel: expect.objectContaining({ weight: 5 }) }),
    );
  });
});
