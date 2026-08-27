import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  paginated,
  PaginatedResult,
} from '../../../../shared/common/pagination/pagination.dto';
import { CategoryDepartmentEntity } from '../../domain/entities/category-department.entity';
import {
  CreateCategoryDepartmentDto,
  DepartmentQueryDto,
  UpdateCategoryDepartmentDto,
} from '../../infrastructure/http/dto/category-department.dto';

@Injectable()
export class CategoryDepartmentService {
  constructor(
    @InjectRepository(CategoryDepartmentEntity)
    private readonly repo: Repository<CategoryDepartmentEntity>,
  ) {}

  async list(
    query: DepartmentQueryDto,
  ): Promise<PaginatedResult<CategoryDepartmentEntity>> {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { code: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });

    return paginated(items, total, query);
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

  /**
   * Soft delete: marks department as inactive instead of physical deletion.
   * Phase 6: prevents data loss and maintains referential integrity.
   */
  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.save({ ...existing, isActive: false });
  }
}
