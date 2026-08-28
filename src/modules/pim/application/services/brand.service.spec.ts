import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrandEntity } from '../../domain/entities/brand.entity';
import { BrandService } from './brand.service';
import { BrandQueryDto } from '../../infrastructure/http/dto/taxonomies.dto';

describe('BrandService — pagination (Phase 2)', () => {
  let service: BrandService;
  let repo: jest.Mocked<Repository<BrandEntity>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandService,
        {
          provide: getRepositoryToken(BrandEntity),
          useValue: {
            findAndCount: jest.fn(),
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
    repo = module.get(getRepositoryToken(BrandEntity));
  });

  it('returns paginated results with default page and limit', async () => {
    const mockBrands: BrandEntity[] = [
      { id: 1, name: 'Brand A', brandCode: 'A', isActive: true } as BrandEntity,
      { id: 2, name: 'Brand B', brandCode: 'B', isActive: true } as BrandEntity,
    ];
    repo.findAndCount.mockResolvedValue([mockBrands, 50]);

    const query = new BrandQueryDto();
    const result = await service.list(query);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(50);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.pages).toBe(2);
    expect(repo.findAndCount).toHaveBeenCalledWith({
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
    repo.findAndCount.mockResolvedValue([mockBrands, 100]);

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
    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: {},
      order: { name: 'ASC' },
      skip: 20, // (3 - 1) * 10
      take: 10,
    });
  });

  it('filters by isActive when specified', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      isActive: false,
    });

    await service.list(query);

    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: { isActive: false },
      order: { name: 'ASC' },
      skip: 0,
      take: 25,
    });
  });

  it('returns at least 1 page when total is 0', async () => {
    repo.findAndCount.mockResolvedValue([[], 0]);

    const query = new BrandQueryDto();
    const result = await service.list(query);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.pages).toBe(1);
  });

  it('calculates pages correctly for exact multiples', async () => {
    repo.findAndCount.mockResolvedValue([[], 50]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      limit: 25,
    });

    const result = await service.list(query);

    expect(result.pages).toBe(2);
  });

  it('rounds up pages for non-exact totals', async () => {
    repo.findAndCount.mockResolvedValue([[], 51]);

    const query: BrandQueryDto = Object.assign(new BrandQueryDto(), {
      limit: 25,
    });

    const result = await service.list(query);

    expect(result.pages).toBe(3);
  });
});
