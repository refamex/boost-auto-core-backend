import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductColorEntity } from '../../domain/entities/product-color.entity';
import { ProductDimensionEntity } from '../../domain/entities/product-dimension.entity';
import { ProductImageEntity } from '../../domain/entities/product-image.entity';
import { ProductCrossReferenceEntity } from '../../domain/entities/product-cross-reference.entity';
import {
  CreateCrossReferenceDto,
  CreateProductColorDto,
  CreateProductImageDto,
  UpsertProductDimensionDto,
} from '../../infrastructure/http/dto/product.dto';

@Injectable()
export class ProductColorService {
  constructor(
    @InjectRepository(ProductColorEntity)
    private readonly repo: Repository<ProductColorEntity>,
  ) {}

  listByProduct(productId: number): Promise<ProductColorEntity[]> {
    return this.repo.find({ where: { productId } });
  }

  create(productId: number, dto: CreateProductColorDto): Promise<ProductColorEntity> {
    return this.repo.save(this.repo.create({ ...dto, productId }));
  }

  async remove(id: number): Promise<void> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Color ${id} not found`);
    await this.repo.remove(found);
  }
}

@Injectable()
export class ProductImageService {
  constructor(
    @InjectRepository(ProductImageEntity)
    private readonly repo: Repository<ProductImageEntity>,
  ) {}

  listBySku(sku: string): Promise<ProductImageEntity[]> {
    return this.repo.find({ where: { productSku: sku }, order: { createdAt: 'DESC' } });
  }

  create(sku: string, dto: CreateProductImageDto): Promise<ProductImageEntity> {
    return this.repo.save(this.repo.create({ productSku: sku, url: dto.url }));
  }

  async remove(id: string): Promise<void> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Image ${id} not found`);
    await this.repo.remove(found);
  }
}

@Injectable()
export class ProductDimensionService {
  constructor(
    @InjectRepository(ProductDimensionEntity)
    private readonly repo: Repository<ProductDimensionEntity>,
  ) {}

  async findBySku(sku: string): Promise<ProductDimensionEntity> {
    const found = await this.repo.findOne({ where: { productSku: sku } });
    if (!found) throw new NotFoundException(`Dimension for sku=${sku} not found`);
    return found;
  }

  async upsertBySku(sku: string, dto: UpsertProductDimensionDto): Promise<ProductDimensionEntity> {
    const existing = await this.repo.findOne({ where: { productSku: sku } });
    if (existing) {
      return this.repo.save(this.repo.merge(existing, dto));
    }
    return this.repo.save(this.repo.create({ productSku: sku, ...dto }));
  }
}

@Injectable()
export class ProductCrossReferenceService {
  constructor(
    @InjectRepository(ProductCrossReferenceEntity)
    private readonly repo: Repository<ProductCrossReferenceEntity>,
  ) {}

  listBySku(sku: string): Promise<ProductCrossReferenceEntity[]> {
    return this.repo.find({ where: { productSku: sku }, order: { createdAt: 'DESC' } });
  }

  async create(sku: string, dto: CreateCrossReferenceDto): Promise<ProductCrossReferenceEntity> {
    if (dto.referenceProductSku && dto.referenceProductSku === sku) {
      throw new ConflictException('reference_product_sku cannot equal product_sku');
    }
    return this.repo.save(this.repo.create({ productSku: sku, ...dto }));
  }

  async remove(id: string): Promise<void> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`CrossReference ${id} not found`);
    await this.repo.remove(found);
  }
}
