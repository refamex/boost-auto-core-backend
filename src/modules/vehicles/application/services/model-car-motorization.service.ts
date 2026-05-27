import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { ModelCarMotorizationEntity } from '../../domain/entities/model-car-motorization.entity';
import { CreateModelCarMotorizationDto } from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class ModelCarMotorizationService {
  constructor(
    @InjectRepository(ModelCarMotorizationEntity)
    private readonly repo: Repository<ModelCarMotorizationEntity>,
  ) {}

  list(modelCarCode?: string, motorizationCode?: string): Promise<ModelCarMotorizationEntity[]> {
    const where: FindOptionsWhere<ModelCarMotorizationEntity> = {};
    if (modelCarCode) where.modelCarCode = modelCarCode;
    if (motorizationCode) where.motorizationCode = motorizationCode;
    return this.repo.find({ where, order: { modelCarCode: 'ASC' } });
  }

  async create(dto: CreateModelCarMotorizationDto): Promise<ModelCarMotorizationEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('model_car_code/motorization_code pair already exists');
      }
      throw e;
    }
  }

  async remove(id: number): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`ModelCarMotorization ${id} not found`);
    await this.repo.remove(existing);
  }
}
