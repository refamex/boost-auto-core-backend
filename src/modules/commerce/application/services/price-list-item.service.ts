import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    const found = await this.repo.findOne({
      where: { id },
      relations: ['product'],
    });
    if (!found) throw new NotFoundException(`PriceListItem ${id} not found`);
    return found;
  }

  /**
   * Resolves the price that applies to a product for a given quantity and date.
   *
   * Picks the best qualifying volume tier: the highest min_qty at or below the
   * requested quantity, within the item's validity window. min_qty is
   * `INT DEFAULT 1` with no NOT NULL, so it is coalesced rather than compared
   * directly — a plain `min_qty <= qty` would silently skip NULL rows.
   *
   * The tie-break on created_at is defense in depth: Postgres treats NULLs as
   * distinct in unique constraints, so two tiers with a NULL valid_from can
   * still coexist and the pick has to stay deterministic anyway.
   */
  async resolveApplicablePrice(
    priceListId: string,
    productId: number,
    qty: number,
    asOf: Date,
  ): Promise<PriceListItemEntity> {
    const found = await this.tryResolveApplicablePrice(
      priceListId,
      productId,
      qty,
      asOf,
    );
    if (!found) {
      throw new NotFoundException(
        `no applicable price for product ${productId} at qty ${qty} in price list ${priceListId}`,
      );
    }
    return found;
  }

  /**
   * Same resolution, `null` instead of a 404.
   *
   * Orders price off the list when it covers the product and fall back to
   * `pim.product.price` when it does not, so for them an uncovered line is an
   * ordinary outcome rather than an error. Quotes keep the throwing variant
   * above and stay fail-closed. Both go through this one query so the two can
   * never disagree about which tier applies.
   */
  tryResolveApplicablePrice(
    priceListId: string,
    productId: number,
    qty: number,
    asOf: Date,
  ): Promise<PriceListItemEntity | null> {
    const day = asOf.toISOString().slice(0, 10); // valid_from / valid_to are DATE
    return this.repo
      .createQueryBuilder('i')
      .innerJoinAndSelect('i.priceList', 'pl')
      .where('i.price_list_id = :priceListId', { priceListId })
      .andWhere('i.product_id = :productId', { productId })
      .andWhere('COALESCE(i.min_qty, 1) <= :qty', { qty })
      .andWhere('(i.valid_from IS NULL OR i.valid_from <= :day)', { day })
      .andWhere('(i.valid_to IS NULL OR i.valid_to >= :day)', { day })
      .orderBy('COALESCE(i.min_qty, 1)', 'DESC')
      .addOrderBy('i.created_at', 'DESC')
      .limit(1)
      .getOne();
  }

  async create(
    priceListId: string,
    dto: CreatePriceListItemDto,
  ): Promise<PriceListItemEntity> {
    try {
      return await this.repo.save(this.repo.create({ priceListId, ...dto }));
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'price list item already exists for product/min_qty/valid_from',
        );
      }
      throw e;
    }
  }

  async update(
    id: string,
    dto: UpdatePriceListItemDto,
  ): Promise<PriceListItemEntity> {
    const existing = await this.findById(id);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findById(id);
    await this.repo.remove(existing);
  }
}
