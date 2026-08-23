import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { SaleEntity } from '../../domain/entities/sale.entity';
import {
  CreateSaleDto,
  SaleQueryDto,
  UpdateSaleDto,
} from '../../infrastructure/http/dto/sale.dto';

@Injectable()
export class SaleService {
  constructor(
    @InjectRepository(SaleEntity)
    private readonly repo: Repository<SaleEntity>,
  ) {}

  list(query: SaleQueryDto): Promise<SaleEntity[]> {
    const where: FindOptionsWhere<SaleEntity> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.orderId) where.orderId = query.orderId;
    return this.repo.find({
      where,
      relations: ['order'],
      order: { soldAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<SaleEntity> {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['order'],
    });
    if (!found) throw new NotFoundException(`Sale ${id} not found`);
    return found;
  }

  async create(dto: CreateSaleDto): Promise<SaleEntity> {
    const subtotal = dto.subtotal ?? 0;
    const discountTotal = dto.discountTotal ?? 0;
    const taxTotal = dto.taxTotal ?? 0;
    const grandTotal = dto.grandTotal ?? subtotal - discountTotal + taxTotal;

    try {
      return await this.repo.save(
        this.repo.create({
          ...dto,
          saleNumber: this.generateSaleNumber(),
          subtotal,
          discountTotal,
          taxTotal,
          grandTotal,
        }),
      );
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('sale number conflict');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateSaleDto): Promise<SaleEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }

  private generateSaleNumber(): string {
    return `SALE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
