import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PaginatedResult,
  paginated,
} from '../../../../shared/common/pagination/pagination.dto';
import { ProductEntity } from '../../domain/entities/product.entity';
import {
  CreateProductDto,
  ProductQueryDto,
  UpdateProductDto,
} from '../../infrastructure/http/dto/product.dto';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {}

  async search(
    query: ProductQueryDto,
  ): Promise<PaginatedResult<ProductEntity>> {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.brand', 'brand')
      .leftJoinAndSelect('p.category', 'category')
      .leftJoinAndSelect('p.autoPartType', 'autoPart')
      .orderBy('p.id', 'DESC');

    if (query.q) {
      qb.andWhere('(p.sku ILIKE :q OR p.name ILIKE :q)', { q: `%${query.q}%` });
    }
    if (query.brandId !== undefined)
      qb.andWhere('p.brand_id = :brandId', { brandId: query.brandId });
    if (query.categoryId !== undefined)
      qb.andWhere('p.category_id = :categoryId', {
        categoryId: query.categoryId,
      });
    if (query.autoPartTypeId !== undefined)
      qb.andWhere('p.auto_part_type_id = :autoPartTypeId', {
        autoPartTypeId: query.autoPartTypeId,
      });
    if (query.providerId !== undefined)
      qb.andWhere('p.provider_id = :providerId', {
        providerId: query.providerId,
      });
    if (query.isVisible !== undefined)
      qb.andWhere('p.is_visible = :isVisible', { isVisible: query.isVisible });

    qb.skip(query.skip).take(query.limit);
    const [items, total] = await qb.getManyAndCount();
    return paginated(items, total, query);
  }

  async findById(id: number): Promise<ProductEntity> {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['brand', 'category', 'autoPartType', 'provider'],
    });
    if (!found) throw new NotFoundException(`Product ${id} not found`);
    return found;
  }

  async findBySku(sku: string): Promise<ProductEntity> {
    const found = await this.repo.findOne({
      where: { sku },
      relations: ['brand', 'category', 'autoPartType', 'provider'],
    });
    if (!found) throw new NotFoundException(`Product sku=${sku} not found`);
    return found;
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
