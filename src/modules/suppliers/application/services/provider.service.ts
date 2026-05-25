import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderEntity } from '../../domain/entities/provider.entity';
import { CreateProviderDto, UpdateProviderDto } from '../../infrastructure/http/dto/supplier.dto';

@Injectable()
export class ProviderService {
  constructor(
    @InjectRepository(ProviderEntity)
    private readonly repo: Repository<ProviderEntity>,
  ) {}

  list(): Promise<ProviderEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: number): Promise<ProviderEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`Provider ${id} not found`);
    return found;
  }

  create(dto: CreateProviderDto): Promise<ProviderEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateProviderDto): Promise<ProviderEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
