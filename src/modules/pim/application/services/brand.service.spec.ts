import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BrandEntity } from '../../domain/entities/brand.entity';
import { BrandService } from './brand.service';
import { BrandQueryDto } from '../../infrastructure/http/dto/taxonomies.dto';

describe('BrandService — pagination (Phase 2)', () => {
  let service: BrandService;

  /**
   * Held standalone rather than read back off the repository mock: asserting
   * on a method plucked off that mock passes an unbound method reference
   * around, which is what @typescript-eslint/unbound-method exists to catch.
   */
  const findAndCount = jest.fn();

  beforeEach(async () => {
    findAndCount.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandService,
        {
          provide: getRepositoryToken(BrandEntity),
          useValue: {
            findAndCount,
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            merge: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BrandService>(BrandService);
  });

  it('returns paginated results with default page and limit', async () => {
    const mockBrands: BrandEntity[] = [
      { id: 1, name: 'Brand A', brandCode: 'A', isActive: true } as BrandEntity,
      { id: 2, name: 'Brand B', brandCode: 'B', isActive: true } as BrandEntity,
    ];
    findAndCount.mockResolvedValue([mockBrands, 50]);

    const query = new BrandQueryDto();
    const result = await service.list(query);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(50);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.pages).toBe(2);
    expect(findAndCount).toHaveBeenCalledWith({
      where: {},
      order: { name: 'ASC' },
      skip: 0,
      take: 25,
    });
  });

  it('applies pagination with custom page and limit', async () => {
    const mockBrands: BrandEntity[] = [
      {
        id: 11,
        name: 'Brand K',
        brandCode: 'K',
        isActive: true,
      } as BrandEntity,
    ];
    findAndCount.mockResolvedValue([mockBrands, 100]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      page: 3,
      limit: 10,
    });

    const result = await service.list(query);

    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(100);
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
    expect(result.pages).toBe(10);
    expect(findAndCount).toHaveBeenCalledWith({
      where: {},
      order: { name: 'ASC' },
      skip: 20, // (3 - 1) * 10
      take: 10,
    });
  });

  it('filters by isActive when specified', async () => {
    findAndCount.mockResolvedValue([[], 0]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      isActive: false,
    });

    await service.list(query);

    expect(findAndCount).toHaveBeenCalledWith({
      where: { isActive: false },
      order: { name: 'ASC' },
      skip: 0,
      take: 25,
    });
  });

  it('returns at least 1 page when total is 0', async () => {
    findAndCount.mockResolvedValue([[], 0]);

    const query = new BrandQueryDto();
    const result = await service.list(query);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.pages).toBe(1);
  });

  it('calculates pages correctly for exact multiples', async () => {
    findAndCount.mockResolvedValue([[], 50]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      limit: 25,
    });

    const result = await service.list(query);

    expect(result.pages).toBe(2);
  });

  it('rounds up pages for non-exact totals', async () => {
    findAndCount.mockResolvedValue([[], 51]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      limit: 25,
    });

    const result = await service.list(query);

    expect(result.pages).toBe(3);
  });
});
