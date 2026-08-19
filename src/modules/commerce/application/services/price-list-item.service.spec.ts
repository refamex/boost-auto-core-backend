import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PriceListItemEntity } from '../../domain/entities/price-list-item.entity';
import { PriceListItemService } from './price-list-item.service';

describe('PriceListItemService.resolveApplicablePrice', () => {
  const qb = {
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const repo = { createQueryBuilder: jest.fn(() => qb) };

  let service: PriceListItemService;

  /** Every `andWhere` fragment emitted for the last call, joined for matching. */
  type AndWhereCall = [string, Record<string, unknown>?];
  const andWhereCalls = (): AndWhereCall[] =>
    qb.andWhere.mock.calls as AndWhereCall[];
  const conditions = (): string =>
    andWhereCalls()
      .map((c) => c[0])
      .join(' | ');

  beforeEach(async () => {
    jest.clearAllMocks();
    qb.getOne.mockResolvedValue({ id: 'tier-10', price: 1250, minQty: 10 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceListItemService,
        { provide: getRepositoryToken(PriceListItemEntity), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PriceListItemService);
  });

  it('returns the matching price list item', async () => {
    const found = await service.resolveApplicablePrice(
      'list-1',
      42,
      10,
      new Date(),
    );
    expect(found.price).toBe(1250);
  });

  it('picks the highest qualifying volume tier', async () => {
    await service.resolveApplicablePrice('list-1', 42, 10, new Date());
    expect(conditions()).toContain('COALESCE(i.min_qty, 1) <= :qty');
    expect(qb.orderBy).toHaveBeenCalledWith('COALESCE(i.min_qty, 1)', 'DESC');
    expect(qb.limit).toHaveBeenCalledWith(1);
  });

  it('coalesces a null min_qty rather than dropping the row', async () => {
    // min_qty is `INT DEFAULT 1` with no NOT NULL, so a bare `min_qty <= :qty`
    // would silently skip rows that never had one set.
    await service.resolveApplicablePrice('list-1', 42, 1, new Date());
    expect(conditions()).not.toMatch(/[^(]i\.min_qty <=/);
    expect(conditions()).toContain('COALESCE(i.min_qty, 1)');
  });

  it('breaks ties deterministically on created_at', async () => {
    // Two tiers with the same min_qty and a NULL valid_from remain insertable
    // even after the unique-constraint fix, because Postgres treats NULLs as
    // distinct. The pick must not depend on physical row order.
    await service.resolveApplicablePrice('list-1', 42, 10, new Date());
    expect(qb.addOrderBy).toHaveBeenCalledWith('i.created_at', 'DESC');
  });

  it('filters on the validity window using the calendar day', async () => {
    await service.resolveApplicablePrice(
      'list-1',
      42,
      5,
      new Date('2026-06-15T23:30:00.000Z'),
    );
    expect(conditions()).toContain(
      'i.valid_from IS NULL OR i.valid_from <= :day',
    );
    expect(conditions()).toContain('i.valid_to IS NULL OR i.valid_to >= :day');
    const dayParam = andWhereCalls().find((c) => c[1] && 'day' in c[1])?.[1];
    expect(dayParam).toEqual({ day: '2026-06-15' });
  });

  it('throws 404 naming the product when nothing applies', async () => {
    qb.getOne.mockResolvedValue(null);
    await expect(
      service.resolveApplicablePrice('list-1', 42, 3, new Date()),
    ).rejects.toThrow(NotFoundException);
    await expect(
      service.resolveApplicablePrice('list-1', 42, 3, new Date()),
    ).rejects.toThrow(/product 42/);
  });
});
