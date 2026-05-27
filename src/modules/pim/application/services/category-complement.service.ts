import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CategoryComplementEntity } from '../../domain/entities/category-complement.entity';
import { CreateCategoryComplementDto } from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class CategoryComplementService {
  constructor(
    @InjectRepository(CategoryComplementEntity)
    private readonly repo: Repository<CategoryComplementEntity>,
  ) {}

  list(categoryIndexId?: number): Promise<CategoryComplementEntity[]> {
    const where: FindOptionsWhere<CategoryComplementEntity> = {};
    if (categoryIndexId) where.categoryIndexId = categoryIndexId;
    return this.repo.find({
      where,
      relations: ['categoryIndex', 'categoryComplement'],
    });
  }

  create(dto: CreateCategoryComplementDto): Promise<CategoryComplementEntity> {
    if (dto.categoryIndexId === dto.categoryComplementId) {
      throw new BadRequestException('categoryIndexId and categoryComplementId must differ');
    }
    return this.repo.save(this.repo.create(dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`CategoryComplement ${id} not found`);
    await this.repo.remove(existing);
  }
}
