import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { BrandCategoryEntity } from '../../domain/entities/brand-category.entity';
import { CreateBrandCategoryDto } from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class BrandCategoryService {
  constructor(
    @InjectRepository(BrandCategoryEntity)
    private readonly repo: Repository<BrandCategoryEntity>,
  ) {}

  list(brandCode?: string, categoryCode?: string): Promise<BrandCategoryEntity[]> {
    const where: FindOptionsWhere<BrandCategoryEntity> = {};
    if (brandCode) where.brandCode = brandCode;
    if (categoryCode) where.categoryCode = categoryCode;
    return this.repo.find({ where, order: { brandCode: 'ASC' } });
  }

  async create(dto: CreateBrandCategoryDto): Promise<BrandCategoryEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('brand_code/category_code pair already exists');
      }
      throw e;
    }
  }

  async remove(id: number): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`BrandCategory ${id} not found`);
    await this.repo.remove(existing);
  }
}
