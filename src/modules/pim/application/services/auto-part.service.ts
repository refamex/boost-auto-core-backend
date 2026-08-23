import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoPartCatalogEntity } from '../../domain/entities/auto-part-catalog.entity';
import {
  CreateAutoPartDto,
  UpdateAutoPartDto,
} from '../../infrastructure/http/dto/taxonomies.dto';

@Injectable()
export class AutoPartService {
  constructor(
    @InjectRepository(AutoPartCatalogEntity)
    private readonly repo: Repository<AutoPartCatalogEntity>,
  ) {}

  list(): Promise<AutoPartCatalogEntity[]> {
    return this.repo.find({
      order: { name: 'ASC' },
      relations: ['category', 'volumeCategory'],
    });
  }

  async findById(id: number): Promise<AutoPartCatalogEntity> {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['category', 'volumeCategory'],
    });
    if (!found) throw new NotFoundException(`AutoPart ${id} not found`);
    return found;
  }

  create(dto: CreateAutoPartDto): Promise<AutoPartCatalogEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(
    id: number,
    dto: UpdateAutoPartDto,
  ): Promise<AutoPartCatalogEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
