import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { YearCarEntity } from '../../domain/entities/year-car.entity';
import {
  CreateYearCarDto,
  UpdateYearCarDto,
} from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class YearCarService {
  constructor(
    @InjectRepository(YearCarEntity)
    private readonly repo: Repository<YearCarEntity>,
  ) {}

  list(): Promise<YearCarEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: number): Promise<YearCarEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`YearCar ${id} not found`);
    return found;
  }

  async findByCode(code: string): Promise<YearCarEntity> {
    const found = await this.repo.findOne({ where: { code } });
    if (!found) throw new NotFoundException(`YearCar code ${code} not found`);
    return found;
  }

  create(dto: CreateYearCarDto): Promise<YearCarEntity> {
    return this.repo.save(this.repo.create(dto));
  }

  async update(id: number, dto: UpdateYearCarDto): Promise<YearCarEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
