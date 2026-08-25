import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ModelCarEntity } from '../../domain/entities/model-car.entity';
import {
  CreateModelCarDto,
  UpdateModelCarDto,
} from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class ModelCarService {
  constructor(
    @InjectRepository(ModelCarEntity)
    private readonly repo: Repository<ModelCarEntity>,
    private readonly ds: DataSource,
  ) {}
  list(codeAssemblyPlant?: string) {
    const qb = this.repo
      .createQueryBuilder('model')
      .leftJoinAndSelect('model.assemblyPlant', 'plant')
      .orderBy('model.code_model', 'ASC');
    if (codeAssemblyPlant)
      qb.andWhere('plant.code=:codeAssemblyPlant', { codeAssemblyPlant });
    return qb.getMany();
  }
  async findById(id: string) {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['assemblyPlant'],
    });
    if (!found) throw new NotFoundException(`ModelCar ${id} not found`);
    return found;
  }
  async findByCode(code: string) {
    const found = await this.repo.findOne({
      where: { codeModel: code },
      relations: ['assemblyPlant'],
    });
    if (!found) throw new NotFoundException(`ModelCar code ${code} not found`);
    return found;
  }
  async create(dto: CreateModelCarDto) {
    return this.repo.save(
      this.repo.create({
        codeModel: dto.codeModel,
        modelCar: dto.modelCar,
        assemblyPlantId: await this.plantId(dto.codeAssemblyPlant),
      }),
    );
  }
  async update(id: string, dto: UpdateModelCarDto) {
    const existing = await this.findById(id);
    return this.repo.save(
      this.repo.merge(existing, {
        codeModel: dto.codeModel,
        modelCar: dto.modelCar,
        ...(dto.codeAssemblyPlant !== undefined
          ? { assemblyPlantId: await this.plantId(dto.codeAssemblyPlant) }
          : {}),
      }),
    );
  }
  private async plantId(code?: string) {
    if (!code) return null;
    const [row] = await this.ds.query<{ id: string }[]>(
      'SELECT id FROM vehicles.assembly_plant WHERE code=$1',
      [code],
    );
    if (!row)
      throw new NotFoundException(`Assembly plant code ${code} not found`);
    return String(row.id);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findById(id));
  }
}
