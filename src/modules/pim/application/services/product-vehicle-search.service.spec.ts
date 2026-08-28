import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SelectQueryBuilder } from 'typeorm';
import { ProductEntity } from '../../domain/entities/product.entity';
import { ProductService } from './product.service';
import { VehicleProductQueryDto } from '../../infrastructure/http/dto/product.dto';

describe('ProductService — Vehicle Search (Phase 4)', () => {
  let service: ProductService;
  let mockQueryBuilder: Partial<SelectQueryBuilder<ProductEntity>>;

  beforeEach(async () => {
    // Mock query builder chain
    mockQueryBuilder = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const mockRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        {
          provide: getRepositoryToken(ProductEntity),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  it('should filter by modelId when provided', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.model_id = :modelId',
      { modelId: 123 },
    );
  });

  it('should filter by yearId when provided', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      yearId: 456,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.year_id = :yearId',
      { yearId: 456 },
    );
  });

  it('should filter by assemblyPlantId when provided', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      assemblyPlantId: 789,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.assembly_plant_id = :assemblyPlantId',
      { assemblyPlantId: 789 },
    );
  });

  it('should filter by motorizationId when provided', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      motorizationId: 321,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.motorization_id = :motorizationId',
      { motorizationId: 321 },
    );
  });

  it('should filter by isVisible when provided', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      isVisible: true,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'p.is_visible = :isVisible',
      { isVisible: true },
    );
  });

  it('should combine multiple vehicle filters', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      yearId: 456,
      assemblyPlantId: 789,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.model_id = :modelId',
      { modelId: 123 },
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.year_id = :yearId',
      { yearId: 456 },
    );
    expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
      'c.assembly_plant_id = :assemblyPlantId',
      { assemblyPlantId: 789 },
    );
  });

  it('should use INNER JOIN with compatibility table', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.innerJoin).toHaveBeenCalledWith(
      'compatibility.compatibilities',
      'c',
      'c.product_id = p.id',
    );
  });

  it('should return paginated results', async () => {
    const mockProducts = [
      { id: 1, sku: 'ABC123', name: 'Product 1' },
      { id: 2, sku: 'DEF456', name: 'Product 2' },
    ] as ProductEntity[];

    mockQueryBuilder.getManyAndCount = jest
      .fn()
      .mockResolvedValue([mockProducts, 2]);

    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      page: 1,
      limit: 20,
    });

    const result = await service.findProductsByVehicle(query);

    expect(result.items).toEqual(mockProducts);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.pages).toBe(1);
  });

  it('should apply distinct to avoid duplicate products', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      page: 1,
      limit: 20,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.distinct).toHaveBeenCalledWith(true);
  });

  it('should apply pagination with skip and take', async () => {
    const query = Object.assign(new VehicleProductQueryDto(), {
      modelId: 123,
      page: 2,
      limit: 10,
    });

    await service.findProductsByVehicle(query);

    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
  });
});
