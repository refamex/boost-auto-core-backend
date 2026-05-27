import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PriceListItemEntity } from '../../domain/entities/price-list-item.entity';
import {
  CreatePriceListItemDto,
  UpdatePriceListItemDto,
} from '../../infrastructure/http/dto/commerce.dto';

@Injectable()
export class PriceListItemService {
  constructor(
    @InjectRepository(PriceListItemEntity)
    private readonly repo: Repository<PriceListItemEntity>,
  ) {}

  listByPriceList(priceListId: string): Promise<PriceListItemEntity[]> {
    return this.repo.find({
      where: { priceListId },
      relations: ['product'],
      order: { productId: 'ASC' },
    });
  }

  async findById(id: string): Promise<PriceListItemEntity> {
    const found = await this.repo.findOne({ where: { id }, relations: ['product'] });
    if (!found) throw new NotFoundException(`PriceListItem ${id} not found`);
    return found;
  }

  async create(priceListId: string, dto: CreatePriceListItemDto): Promise<PriceListItemEntity> {
    try {
      return await this.repo.save(this.repo.create({ priceListId, ...dto }));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as { code?: string }).code === '23505') {
        throw new ConflictException('price list item already exists for product/valid_from');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePriceListItemDto): Promise<PriceListItemEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
