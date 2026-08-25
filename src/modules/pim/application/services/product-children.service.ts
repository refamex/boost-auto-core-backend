import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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

async function productId(ds: DataSource, sku: string): Promise<number> {
  const rows = await ds.query<{ id: number }[]>(
    'SELECT id FROM pim.product WHERE sku = $1',
    [sku],
  );
  if (!rows[0]) throw new NotFoundException(`Product sku=${sku} not found`);
  return Number(rows[0].id);
}

@Injectable()
export class ProductColorService {
  constructor(
    @InjectRepository(ProductColorEntity)
    private readonly repo: Repository<ProductColorEntity>,
  ) {}
  listByProduct(productId: number) {
    return this.repo.find({ where: { productId } });
  }
  create(productId: number, dto: CreateProductColorDto) {
    return this.repo.save(this.repo.create({ ...dto, productId }));
  }
  async remove(id: number) {
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
    private readonly ds: DataSource,
  ) {}
  async listBySku(sku: string) {
    return this.repo.find({
      where: { productId: await productId(this.ds, sku) },
      order: { createdAt: 'DESC' },
    });
  }
  async create(sku: string, dto: CreateProductImageDto) {
    return this.repo.save(
      this.repo.create({
        productId: await productId(this.ds, sku),
        url: dto.url,
      }),
    );
  }
  async remove(id: string) {
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
    private readonly ds: DataSource,
  ) {}
  async findBySku(sku: string) {
    const found = await this.repo.findOne({
      where: { productId: await productId(this.ds, sku) },
    });
    if (!found)
      throw new NotFoundException(`Dimension for sku=${sku} not found`);
    return found;
  }
  async upsertBySku(sku: string, dto: UpsertProductDimensionDto) {
    const id = await productId(this.ds, sku);
    const existing = await this.repo.findOne({ where: { productId: id } });
    return this.repo.save(
      existing
        ? this.repo.merge(existing, dto)
        : this.repo.create({ productId: id, ...dto }),
    );
  }
}

@Injectable()
export class ProductCrossReferenceService {
  constructor(
    @InjectRepository(ProductCrossReferenceEntity)
    private readonly repo: Repository<ProductCrossReferenceEntity>,
    private readonly ds: DataSource,
  ) {}
  async listBySku(sku: string) {
    return this.repo.find({
      where: { productId: await productId(this.ds, sku) },
      order: { createdAt: 'DESC' },
      relations: {
        productBrandRef: true,
        reference: true,
        referenceBrandRef: true,
        referenceProduct: true,
      },
    });
  }
  async create(sku: string, dto: CreateCrossReferenceDto) {
    if (dto.referenceProductSku === sku)
      throw new ConflictException(
        'reference_product_sku cannot equal product_sku',
      );
    const entity = this.repo.create({
      productId: await productId(this.ds, sku),
      productBrandId: dto.productBrand
        ? await this.brandId(dto.productBrand)
        : undefined,
      referenceId: dto.referenceSku
        ? await productId(this.ds, dto.referenceSku)
        : undefined,
      referenceBrandId: dto.referenceBrand
        ? await this.brandId(dto.referenceBrand)
        : undefined,
      referenceProductId: dto.referenceProductSku
        ? await productId(this.ds, dto.referenceProductSku)
        : undefined,
      providerSku: dto.providerSku,
    });
    return this.repo.save(entity);
  }
  private async brandId(code: string) {
    const rows = await this.ds.query<{ id: number }[]>(
      'SELECT id FROM pim.brand WHERE brand_code = $1',
      [code],
    );
    if (!rows[0]) throw new NotFoundException(`Brand code=${code} not found`);
    return Number(rows[0].id);
  }
  async remove(id: string) {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`CrossReference ${id} not found`);
    await this.repo.remove(found);
  }
}
