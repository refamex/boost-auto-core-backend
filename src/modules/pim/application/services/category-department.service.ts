import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryDepartmentEntity } from '../../domain/entities/category-department.entity';
import {
  CreateCategoryDepartmentDto,
  UpdateCategoryDepartmentDto,
} from '../../infrastructure/http/dto/category-department.dto';

@Injectable()
export class CategoryDepartmentService {
  constructor(
    @InjectRepository(CategoryDepartmentEntity)
    private readonly repo: Repository<CategoryDepartmentEntity>,
  ) {}

  list() {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: number): Promise<CategoryDepartmentEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found)
      throw new NotFoundException(`CategoryDepartment ${id} not found`);
    return found;
  }

  async create(
    dto: CreateCategoryDepartmentDto,
  ): Promise<CategoryDepartmentEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(
    id: number,
    dto: UpdateCategoryDepartmentDto,
  ): Promise<CategoryDepartmentEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
