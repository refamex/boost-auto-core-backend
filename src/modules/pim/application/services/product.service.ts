import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  PaginatedResult,
  paginated,
} from '../../../../shared/common/pagination/pagination.dto';
import { ProductAvailabilityService } from './product-availability.service';
import { ProductEntity } from '../../domain/entities/product.entity';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
  VehicleProductQueryDto,
} from '../../infrastructure/http/dto/product.dto';

/** The three facets the catalogue filters by. */
type FacetField = 'brand' | 'category' | 'autoPart';

export interface FacetCount {
  id: number;
  count: number;
}

export interface ProductFacets {
  brands: FacetCount[];
  categories: FacetCount[];
  autoParts: FacetCount[];
}

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
    private readonly availability: ProductAvailabilityService,
  ) {}

  /**
   * The catalogue's filter set, in one place.
   *
   * `search` and `facets` MUST narrow identically: a count that comes from a
   * different WHERE than the listing is a number the shopper can prove wrong by
   * clicking it. `skip` lets a facet leave out its own filter — see `facets`.
   */
  private applyFilters(
    qb: SelectQueryBuilder<ProductEntity>,
    query: ProductQueryDto,
    skip?: FacetField,
  ): SelectQueryBuilder<ProductEntity> {
    if (query.q) {
      qb.andWhere('(p.sku ILIKE :q OR p.name ILIKE :q)', { q: `%${query.q}%` });
    }
    if (query.brandId !== undefined && skip !== 'brand')
      qb.andWhere('p.brand_id = :brandId', { brandId: query.brandId });
    if (query.categoryId !== undefined && skip !== 'category')
      qb.andWhere('p.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.autoPartTypeId !== undefined && skip !== 'autoPart')
      qb.andWhere('p.auto_part_type_id = :autoPartTypeId', {
        autoPartTypeId: query.autoPartTypeId,
      });
    if (query.providerId !== undefined)
      qb.andWhere('p.provider_id = :providerId', {
        providerId: query.providerId,
      });
    if (query.isVisible !== undefined)
      qb.andWhere('p.is_visible = :isVisible', { isVisible: query.isVisible });

    return qb;
  }

  async search(
    query: ProductQueryDto,
  ): Promise<PaginatedResult<ProductEntity>> {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.brand', 'brand')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.autoPartType', 'autoPart')
      .orderBy('p.id', 'DESC');

    this.applyFilters(qb, query);

    qb.skip(query.skip).take(query.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(await this.availability.decorate(items), total, query);
  }

  /**
   * How many results each filter option would return.
   *
   * Exists so the storefront can grey out an option instead of walking the
   * shopper into an empty page. Same WHERE as `search`, with one deliberate
   * difference.
   *
   * **A facet never counts under its own filter.** Counting brands while
   * `brandId` is set would leave the chosen brand with a number and every other
   * brand at zero — the shopper could enter a brand and never leave it. Each
   * facet is therefore counted under the *other* facets' filters only, which is
   * what makes the options stay switchable.
   *
   * Options with no results are simply absent; the caller treats a missing id
   * as zero rather than as unknown.
   */
  async facets(query: ProductQueryDto): Promise<ProductFacets> {
    const countBy = async (
      column: string,
      field: FacetField,
    ): Promise<FacetCount[]> => {
      const rows = await this.applyFilters(
        this.repo
          .createQueryBuilder('p')
          .select(`p.${column}`, 'id')
          .addSelect('COUNT(*)', 'count')
          .where(`p.${column} IS NOT NULL`),
        query,
        field,
      )
        .groupBy(`p.${column}`)
        .getRawMany<{ id: string | number; count: string }>();

      return rows.map((r) => ({ id: Number(r.id), count: Number(r.count) }));
    };

    const [brands, categories, autoParts] = await Promise.all([
      countBy('brand_id', 'brand'),
      countBy('category_id', 'category'),
      countBy('auto_part_type_id', 'autoPart'),
    ]);

    return { brands, categories, autoParts };
  }

  async findById(id: number): Promise<ProductEntity> {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['brand', 'category', 'autoPartType', 'provider'],
    });
    if (!found) throw new NotFoundException(`Product ${id} not found`);
    const [decorated] = await this.availability.decorate([found]);
    return decorated;
  }

  async findBySku(sku: string): Promise<ProductEntity> {
    const found = await this.repo.findOne({
      where: { sku },
      relations: ['brand', 'category', 'autoPartType', 'provider'],
    });
    if (!found) throw new NotFoundException(`Product sku=${sku} not found`);
    const [decorated] = await this.availability.decorate([found]);
    return decorated;
  }

  async findProductsByVehicle(
    query: VehicleProductQueryDto,
  ): Promise<PaginatedResult<ProductEntity>> {
    const qb = this.repo
      .createQueryBuilder('p')
      .innerJoin('compatibility.compatibilities', 'c', 'c.product_id = p.id')
      .leftJoinAndSelect('p.brand', 'brand')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.autoPartType', 'autoPart')
      .orderBy('p.id', 'DESC');

    // Vehicle filters
    if (query.modelId !== undefined) {
      qb.andWhere('c.model_id = :modelId', { modelId: query.modelId });
    }
    if (query.yearId !== undefined) {
      qb.andWhere('c.year_id = :yearId', { yearId: query.yearId });
    }
    if (query.assemblyPlantId !== undefined) {
      qb.andWhere('c.assembly_plant_id = :assemblyPlantId', {
        assemblyPlantId: query.assemblyPlantId,
      });
    }
    if (query.motorizationId !== undefined) {
      qb.andWhere('c.motorization_id = :motorizationId', {
        motorizationId: query.motorizationId,
      });
    }

    // Product visibility filter
    if (query.isVisible !== undefined) {
      qb.andWhere('p.is_visible = :isVisible', { isVisible: query.isVisible });
    }

    // Ensure distinct products (a product may match multiple compatibility rows)
    qb.distinct(true);

    qb.skip(query.skip).take(query.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(await this.availability.decorate(items), total, query);
  }

  create(dto: CreateProductDto): Promise<ProductEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateProductDto): Promise<ProductEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
