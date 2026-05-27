import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PriceListEntity } from '../../domain/entities/price-list.entity';
import { CreatePriceListDto, UpdatePriceListDto } from '../../infrastructure/http/dto/commerce.dto';

@Injectable()
export class PriceListService {
  constructor(
    @InjectRepository(PriceListEntity)
    private readonly repo: Repository<PriceListEntity>,
  ) {}

  list(): Promise<PriceListEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: string): Promise<PriceListEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`PriceList ${id} not found`);
    return found;
  }

  async create(dto: CreatePriceListDto): Promise<PriceListEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('price list code already exists');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePriceListDto): Promise<PriceListEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
