import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssemblyPlantEntity } from '../../domain/entities/assembly-plant.entity';
import {
  CreateAssemblyPlantDto,
  UpdateAssemblyPlantDto,
} from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class AssemblyPlantService {
  constructor(
    @InjectRepository(AssemblyPlantEntity)
    private readonly repo: Repository<AssemblyPlantEntity>,
  ) {}

  list(): Promise<AssemblyPlantEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: string): Promise<AssemblyPlantEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`AssemblyPlant ${id} not found`);
    return found;
  }

  async findByCode(code: string): Promise<AssemblyPlantEntity> {
    const found = await this.repo.findOne({ where: { code } });
    if (!found)
      throw new NotFoundException(`AssemblyPlant code ${code} not found`);
    return found;
  }

  create(dto: CreateAssemblyPlantDto): Promise<AssemblyPlantEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(
    id: string,
    dto: UpdateAssemblyPlantDto,
  ): Promise<AssemblyPlantEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
