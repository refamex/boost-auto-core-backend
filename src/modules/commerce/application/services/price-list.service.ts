import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PriceListEntity } from '../../domain/entities/price-list.entity';
import {
  CreatePriceListDto,
  UpdatePriceListDto,
} from '../../infrastructure/http/dto/commerce.dto';

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

  /**
   * The price list that applies to a document: the one named by `code`, or the
   * default list when no code is given.
   *
   * Resolved once per quote rather than per line so a misconfigured catalogue
   * reports itself plainly instead of surfacing as an unpriceable product.
   */
  async findApplicable(code?: string): Promise<PriceListEntity> {
    const found = await this.findApplicableOrNull(code);
    if (!found) {
      throw new BadRequestException(
        'no default price list configured; send priceListCode explicitly',
      );
    }
    return found;
  }

  /**
   * Same resolution, `null` when no default list is configured.
   *
   * A catalogue that does not use price lists at all is not an error for
   * orders — they fall back to `pim.product.price`. A price list named
   * explicitly and *missing* still throws: pricing off something other than the
   * list the caller asked for would hide the misconfiguration behind a wrong
   * charge, which is the whole class of bug this module is closing.
   */
  async findApplicableOrNull(code?: string): Promise<PriceListEntity | null> {
    if (code) {
      const byCode = await this.repo.findOne({ where: { code } });
      if (!byCode) throw new NotFoundException(`PriceList ${code} not found`);
      return byCode;
    }

    return this.repo.findOne({ where: { isDefault: true } });
  }

  async create(dto: CreatePriceListDto): Promise<PriceListEntity> {
    try {
      return await this.repo.save(this.repo.create(dto));
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
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
