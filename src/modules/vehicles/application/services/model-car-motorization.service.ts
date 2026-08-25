import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ModelCarMotorizationEntity } from '../../domain/entities/model-car-motorization.entity';
import { CreateModelCarMotorizationDto } from '../../infrastructure/http/dto/vehicles.dto';

@Injectable()
export class ModelCarMotorizationService {
  constructor(
    @InjectRepository(ModelCarMotorizationEntity)
    private readonly repo: Repository<ModelCarMotorizationEntity>,
    private readonly ds: DataSource,
  ) {}
  list(modelCarCode?: string, motorizationCode?: string) {
    const qb = this.repo
      .createQueryBuilder('link')
      .leftJoinAndSelect('link.modelCar', 'model')
      .leftJoinAndSelect('link.motorization', 'motorization')
      .orderBy('model.code_model', 'ASC');
    if (modelCarCode)
      qb.andWhere('model.code_model=:modelCarCode', { modelCarCode });
    if (motorizationCode)
      qb.andWhere('motorization.code=:motorizationCode', { motorizationCode });
    return qb.getMany();
  }
  async create(dto: CreateModelCarMotorizationDto) {
    const [model] = await this.ds.query<{ id: string }[]>(
      'SELECT id FROM vehicles.model_car WHERE code_model=$1',
      [dto.modelCarCode],
    );
    const [motor] = await this.ds.query<{ id: string }[]>(
      'SELECT id FROM vehicles.motorization_car WHERE code=$1',
      [dto.motorizationCode],
    );
    if (!model || !motor)
      throw new NotFoundException('Model or motorization code not found');
    try {
      return await this.repo.save(
        this.repo.create({
          modelCarId: String(model.id),
          motorizationId: String(motor.id),
        }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      )
        throw new ConflictException('model/motorization pair already exists');
      throw e;
    }
  }
  async remove(id: number) {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing)
      throw new NotFoundException(`ModelCarMotorization ${id} not found`);
    await this.repo.remove(existing);
  }
}
