import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { ImportJobLogEntity } from '../../domain/entities/import-job-log.entity';
import { ImportJobEntity } from '../../domain/entities/import-job.entity';
import {
  CreateImportJobDto,
  CreateImportJobLogDto,
  ImportJobQueryDto,
  UpdateImportJobDto,
} from '../../infrastructure/http/dto/integrations.dto';

@Injectable()
export class ImportJobService {
  constructor(
    @InjectRepository(ImportJobEntity)
    private readonly jobRepo: Repository<ImportJobEntity>,
    @InjectRepository(ImportJobLogEntity)
    private readonly logRepo: Repository<ImportJobLogEntity>,
  ) {}

  list(query: ImportJobQueryDto): Promise<ImportJobEntity[]> {
    const where: FindOptionsWhere<ImportJobEntity> = {};
    if (query.status) where.status = query.status;
    if (query.jobType) where.jobType = query.jobType;
    return this.jobRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<ImportJobEntity> {
    const found = await this.jobRepo.findOne({ where: { id }, relations: ['logs'] });
    if (!found) throw new NotFoundException(`ImportJob ${id} not found`);
    return found;
  }

  create(dto: CreateImportJobDto): Promise<ImportJobEntity> {
    return this.jobRepo.save(this.jobRepo.create(dto));
  }

  async update(id: string, dto: UpdateImportJobDto): Promise<ImportJobEntity> {
    const existing = await this.findById(id);
    return this.jobRepo.save(this.jobRepo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.jobRepo.remove(existing);
  }

  async addLog(jobId: string, dto: CreateImportJobLogDto): Promise<ImportJobLogEntity> {
    await this.findById(jobId);
    return this.logRepo.save(this.logRepo.create({ jobId, ...dto }));
  }

  async listLogs(jobId: string): Promise<ImportJobLogEntity[]> {
    await this.findById(jobId);
    return this.logRepo.find({ where: { jobId }, order: { createdAt: 'DESC' } });
  }
}
