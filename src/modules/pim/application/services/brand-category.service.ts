import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { BrandCategoryEntity } from '../../domain/entities/brand-category.entity';
import { CreateBrandCategoryDto } from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class BrandCategoryService {
  constructor(
    @InjectRepository(BrandCategoryEntity)
    private readonly repo: Repository<BrandCategoryEntity>,
    private readonly ds: DataSource,
  ) {}
  list(brandCode?: string, categoryCode?: string) {
    const qb = this.repo
      .createQueryBuilder('bc')
      .leftJoinAndSelect('bc.brand', 'brand')
      .leftJoinAndSelect('bc.category', 'category')
      .orderBy('brand.brand_code', 'ASC');
    if (brandCode) qb.andWhere('brand.brand_code = :brandCode', { brandCode });
    if (categoryCode)
      qb.andWhere('category.code = :categoryCode', { categoryCode });
    return qb.getMany();
  }
  async create(dto: CreateBrandCategoryDto) {
    const [brand] = await this.ds.query<{ id: number }[]>(
      'SELECT id FROM pim.brand WHERE brand_code=$1',
      [dto.brandCode],
    );
    const [category] = await this.ds.query<{ id: number }[]>(
      'SELECT id FROM pim.category WHERE code=$1',
      [dto.categoryCode],
    );
    if (!brand || !category)
      throw new NotFoundException('Brand or category code not found');
    try {
      return await this.repo.save(
        this.repo.create({
          brandId: Number(brand.id),
          categoryId: Number(category.id),
          isActive: dto.isActive ?? true,
        }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      )
        throw new ConflictException('brand/category pair already exists');
      throw e;
    }
  }
  async remove(id: number) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`BrandCategory ${id} not found`);
    await this.repo.remove(existing);
  }
}
