import { ProductAvailabilityService } from './product-availability.service';
import { ProductEntity } from '../../domain/entities/product.entity';

/**
 * WHY BOOLEANS AND NOT A NUMBER.
 *
 * The storefront needs to stop a shopper checking out with something that is
 * gone. It does NOT need to know how much of it there is — and publishing that
 * would hand the company's inventory to anyone who reads the API, competitors
 * included.
 *
 * `inStock` answers the only question the cart asks. `lowStock` covers the
 * "last units" nudge without leaking the magnitude either.
 */

const product = (id: number): ProductEntity => ({ id }) as ProductEntity;

const buildService = (
  rows: Array<{ productId: string; available: string }>,
  threshold = 5,
) => {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  };
  const repo = { createQueryBuilder: jest.fn(() => qb) };
  const config = { get: jest.fn(() => threshold) };
  return {
    service: new ProductAvailabilityService(repo as never, config as never),
    qb,
  };
};

describe('ProductAvailabilityService', () => {
  it('marks a product with available stock as in stock', async () => {
    const { service } = buildService([{ productId: '1', available: '20' }]);

    const [p] = await service.decorate([product(1)]);

    expect(p.inStock).toBe(true);
    expect(p.lowStock).toBe(false);
  });

  /**
   * A product nobody ever stocked has no inventory rows at all. It must come
   * back as out of stock, not vanish from the catalogue — which is why the
   * lookup is a separate query and not an INNER JOIN.
   */
  it('marks a product with no inventory rows as out of stock', async () => {
    const { service } = buildService([]);

    const [p] = await service.decorate([product(1)]);

    expect(p.inStock).toBe(false);
    expect(p.lowStock).toBe(false);
  });

  it('marks a fully reserved product as out of stock', async () => {
    const { service } = buildService([{ productId: '1', available: '0' }]);

    const [p] = await service.decorate([product(1)]);

    expect(p.inStock).toBe(false);
  });

  /** Reservations can outrun stock; negative available is still just "no". */
  it('treats negative availability as out of stock', async () => {
    const { service } = buildService([{ productId: '1', available: '-3' }]);

    const [p] = await service.decorate([product(1)]);

    expect(p.inStock).toBe(false);
    expect(p.lowStock).toBe(false);
  });

  it('flags low stock strictly inside the threshold', async () => {
    const { service } = buildService([{ productId: '1', available: '5' }], 5);

    const [p] = await service.decorate([product(1)]);

    expect(p.inStock).toBe(true);
    expect(p.lowStock).toBe(true);
  });

  it('does not flag low stock one unit above the threshold', async () => {
    const { service } = buildService([{ productId: '1', available: '6' }], 5);

    const [p] = await service.decorate([product(1)]);

    expect(p.lowStock).toBe(false);
  });

  /**
   * THE assertion this whole design exists for. If a future change starts
   * attaching a count, this fails — which is the only thing standing between
   * "the cart can check availability" and "the catalogue publishes inventory".
   */
  it('never attaches a stock quantity to a product', async () => {
    const { service } = buildService([{ productId: '1', available: '250' }]);

    const [p] = await service.decorate([product(1)]);

    expect(p).not.toHaveProperty('availableStock');
    expect(p).not.toHaveProperty('stock');
    expect(Object.values(p)).not.toContain(250);
  });

  it('queries once for many products rather than once each', async () => {
    const { service, qb } = buildService([]);

    await service.decorate([product(1), product(2), product(3)]);

    expect(qb.getRawMany).toHaveBeenCalledTimes(1);
  });

  it('does not query at all for an empty list', async () => {
    const { service, qb } = buildService([]);

    await expect(service.decorate([])).resolves.toEqual([]);
    expect(qb.getRawMany).not.toHaveBeenCalled();
  });
});
