import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModelCarEntity } from '../../domain/entities/model-car.entity';
import { CreateModelCarDto, UpdateModelCarDto } from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class ModelCarService {
  constructor(
    @InjectRepository(ModelCarEntity)
    private readonly repo: Repository<ModelCarEntity>,
  ) {}

  list(codeAssemblyPlant?: string): Promise<ModelCarEntity[]> {
    return this.repo.find({
      where: codeAssemblyPlant ? { codeAssemblyPlant } : {},
      relations: ['assemblyPlant'],
      order: { codeModel: 'ASC' },
    });
  }

  async findById(id: string): Promise<ModelCarEntity> {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['assemblyPlant'],
    });
    if (!found) throw new NotFoundException(`ModelCar ${id} not found`);
    return found;
  }

  async findByCode(code: string): Promise<ModelCarEntity> {
    const found = await this.repo.findOne({
      where: { codeModel: code },
      relations: ['assemblyPlant'],
    });
    if (!found) throw new NotFoundException(`ModelCar code ${code} not found`);
    return found;
  }

  create(dto: CreateModelCarDto): Promise<ModelCarEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: string, dto: UpdateModelCarDto): Promise<ModelCarEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
