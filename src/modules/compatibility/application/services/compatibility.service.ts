import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { CompatibilityEntity } from '../../domain/entities/compatibility.entity';
import {
  CompatibilityQueryDto,
  CreateCompatibilityDto,
} from '../../infrastructure/http/dto/compatibility.dto';

@Injectable()
export class CompatibilityService {
  constructor(
    @InjectRepository(CompatibilityEntity)
    private readonly repo: Repository<CompatibilityEntity>,
  ) {}

  list(query: CompatibilityQueryDto): Promise<CompatibilityEntity[]> {
    const where: FindOptionsWhere<CompatibilityEntity> = {};
    if (query.sku) where.sku = query.sku;
    if (query.modelCode) where.modelCode = query.modelCode;
    if (query.yearCode) where.yearCode = query.yearCode;
    if (query.assemblyPlantCode) where.assemblyPlantCode = query.assemblyPlantCode;
    if (query.motorizationCode) where.motorizationCode = query.motorizationCode;
    return this.repo.find({ where, order: { sku: 'ASC', createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<CompatibilityEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Compatibility ${id} not found`);
    return found;
  }

  async create(dto: CreateCompatibilityDto): Promise<CompatibilityEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('compatibility tuple already exists for this SKU');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
