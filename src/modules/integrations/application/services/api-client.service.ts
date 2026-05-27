import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import { ApiClientEntity } from '../../domain/entities/api-client.entity';
import {
  CreateApiClientDto,
  UpdateApiClientDto,
} from '../../infrastructure/http/dto/integrations.dto';

@Injectable()
export class ApiClientService {
  constructor(
    @InjectRepository(ApiClientEntity)
    private readonly repo: Repository<ApiClientEntity>,
  ) {}

  list(): Promise<ApiClientEntity[]> {
    return this.repo.find({ order: { name: 'ASC' } });
  }

  async findById(id: number): Promise<ApiClientEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`ApiClient ${id} not found`);
    return found;
  }

  async create(dto: CreateApiClientDto): Promise<ApiClientEntity> {
    try {
      return await this.repo.save(
        this.repo.create({
          ...dto,
          apiKey: randomBytes(32).toString('hex').slice(0, 64),
        }),
      );
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('api key conflict');
      }
      throw e;
    }
  }

  async update(id: number, dto: UpdateApiClientDto): Promise<ApiClientEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
