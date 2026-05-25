import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../../domain/entities/category.entity';
import { CategoryQueryDto, CreateCategoryDto, UpdateCategoryDto } from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(CategoryEntity)
    private readonly repo: Repository<CategoryEntity>,
  ) {}

  list(query: CategoryQueryDto): Promise<CategoryEntity[]> {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.department', 'd')
      .orderBy('c.code', 'ASC');

    if (query.departmentCode) {
      qb.andWhere('d.code = :departmentCode', { departmentCode: query.departmentCode });
    }
    if (query.brandCode) {
      qb.innerJoin('pim.brand_category', 'bc', 'bc.category_code = c.code')
        .andWhere('bc.brand_code = :brandCode', { brandCode: query.brandCode });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('c.is_active = :isActive', { isActive: query.isActive });
    }
    return qb.getMany();
  }

  async findById(id: number): Promise<CategoryEntity> {
    const found = await this.repo.findOne({ where: { id }, relations: ['department'] });
    if (!found) throw new NotFoundException(`Category ${id} not found`);
    return found;
  }

  create(dto: CreateCategoryDto): Promise<CategoryEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateCategoryDto): Promise<CategoryEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
