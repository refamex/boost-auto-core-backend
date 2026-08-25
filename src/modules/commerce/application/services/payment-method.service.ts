import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PaymentMethodEntity } from '../../domain/entities/payment-method.entity';
import {
  CreatePaymentMethodDto,
  UpdatePaymentMethodDto,
} from '../../infrastructure/http/dto/commerce.dto';

@Injectable()
export class PaymentMethodService {
  constructor(
    @InjectRepository(PaymentMethodEntity)
    private readonly repo: Repository<PaymentMethodEntity>,
  ) {}

  list(): Promise<PaymentMethodEntity[]> {
    return this.repo.find({ order: { code: 'ASC' } });
  }

  async findById(id: string): Promise<PaymentMethodEntity> {
    const found = await this.repo.findOne({ where: { id } });
    if (!found) throw new NotFoundException(`PaymentMethod ${id} not found`);
    return found;
  }

  async create(dto: CreatePaymentMethodDto): Promise<PaymentMethodEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException('payment method code already exists');
      }
      throw e;
    }
  }

  async update(
    id: string,
    dto: UpdatePaymentMethodDto,
  ): Promise<PaymentMethodEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
