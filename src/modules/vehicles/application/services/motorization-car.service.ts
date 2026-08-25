import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MotorizationCarEntity } from '../../domain/entities/motorization-car.entity';
import {
  CreateMotorizationCarDto,
  UpdateMotorizationCarDto,
} from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class MotorizationCarService {
  constructor(
    @InjectRepository(MotorizationCarEntity)
    private readonly repo: Repository<MotorizationCarEntity>,
  ) {}

  list(): Promise<MotorizationCarEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: string): Promise<MotorizationCarEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`MotorizationCar ${id} not found`);
    return found;
  }

  async findByCode(code: string): Promise<MotorizationCarEntity> {
    const found = await this.repo.findOne({ where: { code } });
    if (!found)
      throw new NotFoundException(`MotorizationCar code ${code} not found`);
    return found;
  }

  create(dto: CreateMotorizationCarDto): Promise<MotorizationCarEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(
    id: string,
    dto: UpdateMotorizationCarDto,
  ): Promise<MotorizationCarEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
