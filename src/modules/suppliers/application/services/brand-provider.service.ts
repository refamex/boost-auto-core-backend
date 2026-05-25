import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { BrandProviderEntity } from '../../domain/entities/brand-provider.entity';
import { CreateBrandProviderDto } from '../../infrastructure/http/dto/supplier.dto';

@Injectable()
export class BrandProviderService {
  constructor(
    @InjectRepository(BrandProviderEntity)
    private readonly repo: Repository<BrandProviderEntity>,
  ) {}

  listByBrand(brandId: number): Promise<BrandProviderEntity[]> {
    return this.repo.find({ where: { brandId }, relations: ['provider'] });
  }

  listByProvider(providerId: number): Promise<BrandProviderEntity[]> {
    return this.repo.find({ where: { providerId }, relations: ['brand'] });
  }

  async create(dto: CreateBrandProviderDto): Promise<BrandProviderEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('brand_id/provider_id pair already exists');
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { id } });
    if (!existing) throw new NotFoundException(`BrandProvider ${id} not found`);
    await this.repo.remove(existing);
  }
}
