import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VolumeCategoryEntity } from '../../domain/entities/volume-category.entity';
import {
  CreateVolumeCategoryDto,
  UpdateVolumeCategoryDto,
} from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class VolumeCategoryService {
  constructor(
    @InjectRepository(VolumeCategoryEntity)
    private readonly repo: Repository<VolumeCategoryEntity>,
  ) {}

  list(): Promise<VolumeCategoryEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: number): Promise<VolumeCategoryEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`VolumeCategory ${id} not found`);
    return found;
  }

  create(dto: CreateVolumeCategoryDto): Promise<VolumeCategoryEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateVolumeCategoryDto): Promise<VolumeCategoryEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
