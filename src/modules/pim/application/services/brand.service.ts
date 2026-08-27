import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  paginated,
  PaginatedResult,
} from '../../../../shared/common/pagination/pagination.dto';
import { BrandEntity } from '../../domain/entities/brand.entity';
import {
  BrandQueryDto,
  CreateBrandDto,
  UpdateBrandDto,
} from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class BrandService {
  constructor(
    @InjectRepository(BrandEntity)
    private readonly repo: Repository<BrandEntity>,
  ) {}

  async list(query: BrandQueryDto): Promise<PaginatedResult<BrandEntity>> {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { name: 'ASC' },
      skip: query.skip,
      take: query.limit,
    });

    return paginated(items, total, query);
  }

  async findById(id: number): Promise<BrandEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Brand ${id} not found`);
    return found;
  }

  async findByCode(code: string): Promise<BrandEntity> {
    const found = await this.repo.findOne({ where: { brandCode: code } });
    if (!found) throw new NotFoundException(`Brand code ${code} not found`);
    return found;
  }

  create(dto: CreateBrandDto): Promise<BrandEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateBrandDto): Promise<BrandEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
