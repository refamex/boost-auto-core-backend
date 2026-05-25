import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ProviderBranchEntity } from '../../domain/entities/provider-branch.entity';
import {
  CreateProviderBranchDto,
  UpdateProviderBranchDto,
} from '../../infrastructure/http/dto/supplier.dto';

@Injectable()
export class ProviderBranchService {
  constructor(
    @InjectRepository(ProviderBranchEntity)
    private readonly repo: Repository<ProviderBranchEntity>,
    private readonly dataSource: DataSource,
  ) {}

  listByProvider(providerId: number): Promise<ProviderBranchEntity[]> {
    return this.repo.find({ where: { providerId }, order: { branchName: 'ASC' } });
  }

  async findById(id: string): Promise<ProviderBranchEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`ProviderBranch ${id} not found`);
    return found;
  }

  async create(providerId: number, dto: CreateProviderBranchDto): Promise<ProviderBranchEntity> {
    return this.dataSource.transaction(async (tx) => {
      if (dto.isMainBranch) {
        await this.demoteOtherMainBranches(tx, providerId);
      }
      return tx.getRepository(ProviderBranchEntity).save(
        tx.getRepository(ProviderBranchEntity).create({ providerId, ...dto }),
      );
    });
  }

  async update(id: string, dto: UpdateProviderBranchDto): Promise<ProviderBranchEntity> {
    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(ProviderBranchEntity);
      const existing = await repo.findOne({ where: { id } });
      if (!existing) throw new NotFoundException(`ProviderBranch ${id} not found`);

      if (dto.isMainBranch === true && !existing.isMainBranch) {
        await this.demoteOtherMainBranches(tx, existing.providerId, id);
      }
      return repo.save(repo.merge(existing, dto));
    });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (existing.isMainBranch) {
      throw new ConflictException('Cannot delete the main branch; promote another branch first');
    }
    await this.repo.remove(existing);
  }

  private async demoteOtherMainBranches(
    tx: { getRepository: (e: typeof ProviderBranchEntity) => Repository<ProviderBranchEntity> },
    providerId: number,
    exceptId?: string,
  ): Promise<void> {
    const qb = tx
      .getRepository(ProviderBranchEntity)
      .createQueryBuilder()
      .update()
      .set({ isMainBranch: false })
      .where('provider_id = :providerId AND is_main_branch = TRUE', { providerId });
    if (exceptId) qb.andWhere('id <> :exceptId', { exceptId });
    await qb.execute();
  }
}
