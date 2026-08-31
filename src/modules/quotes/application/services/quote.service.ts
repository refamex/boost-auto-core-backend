import {
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validateOrReject } from 'class-validator';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  PaginatedResult,
  paginated,
} from '../../../../shared/common/pagination/pagination.dto';
import { PriceListItemService } from '../../../commerce/application/services/price-list-item.service';
import { PriceListService } from '../../../commerce/application/services/price-list.service';
import { documentPriceListCode } from '../../../commerce/domain/document-price-list-code';
import { PriceListEntity } from '../../../commerce/domain/entities/price-list.entity';
import { CustomerProfileService } from '../../../customers/application/services/customer-profile.service';
import { OrderService } from '../../../orders/application/services/order.service';
import { priceLine, round2 } from '../../../orders/domain/order-pricing';
import { CreateOrderDto } from '../../../orders/infrastructure/http/dto/order.dto';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import { QuoteItemEntity } from '../../domain/entities/quote-item.entity';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import {
  QUOTE_TRANSITIONS,
  QuoteAction,
  QuoteEffectiveStatus,
  isEditable,
} from '../../domain/quote-status';
import { buildWhere, effectiveStatus } from '../../domain/quote-visibility';
import {
  CreateQuoteDto,
  CreateQuoteItemDto,
  QuoteQueryDto,
  UpdateQuoteDto,
} from '../../infrastructure/http/dto/quote.dto';

/**
 * What callers receive. Deliberately not the raw entity: `status` here is the
 * derived one, and an entity carrying a derived `expired` would persist it on
 * the next save.
 */
export type QuoteView = Omit<QuoteEntity, 'status'> & {
  status: QuoteEffectiveStatus;
};

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);

  constructor(
    @InjectRepository(QuoteEntity)
    private readonly quoteRepo: Repository<QuoteEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
    private readonly priceLists: PriceListService,
    private readonly priceListItems: PriceListItemService,
    private readonly profiles: CustomerProfileService,
    private readonly orders: OrderService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: QuoteQueryDto,
  ): Promise<PaginatedResult<QuoteView>> {
    const now = new Date();
    const where = buildWhere(user, query, now);
    if (!where) return paginated<QuoteView>([], 0, query);

    const [rows, total] = await this.quoteRepo.findAndCount({
      where,
      relations: ['items'],
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(
      rows.map((q) => this.toView(q, now)),
      total,
      query,
    );
  }

  async findById(id: string, user: AuthenticatedUser): Promise<QuoteView> {
    const now = new Date();
    const quote = await this.loadVisible(id, user, now);
    return this.toView(quote, now);
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateQuoteDto,
  ): Promise<QuoteView> {
    const salesRepId = this.assertRep(user);
    const now = new Date();
    const priceList = await this.applicableList(
      dto.customerId,
      dto.priceListCode,
    );
    const { items, subtotal, taxTotal } = await this.priceItems(
      dto.items,
      priceList,
      now,
    );

    const created = await this.dataSource.transaction(async (tx) => {
      const quote = await tx.getRepository(QuoteEntity).save(
        tx.getRepository(QuoteEntity).create({
          quoteNumber: this.generateQuoteNumber(),
          customerId: dto.customerId,
          salesRepId,
          priceListId: priceList?.id ?? null,
          currency: priceList?.currency ?? 'MXN',
          status: 'draft',
          validUntil: dto.validUntil,
          notes: dto.notes,
          subtotal,
          taxTotal,
          grandTotal: round2(subtotal + taxTotal),
        }),
      );

      await tx
        .getRepository(QuoteItemEntity)
        .save(
          items.map((i) =>
            tx
              .getRepository(QuoteItemEntity)
              .create({ ...i, quoteId: quote.id }),
          ),
        );

      const full = await tx
        .getRepository(QuoteEntity)
        .findOne({ where: { id: quote.id }, relations: ['items'] });
      if (!full) throw new NotFoundException(`Quote ${quote.id} not found`);
      return full;
    });

    return this.toView(created, now);
  }

  /** Editing is draft-only and re-prices every line against the current lists. */
  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateQuoteDto,
  ): Promise<QuoteView> {
    this.assertRep(user);
    const now = new Date();
    const existing = await this.loadOwned(id, user);
    if (!isEditable(existing.status)) {
      throw new ConflictException(
        `quote in status ${existing.status} can no longer be edited`,
      );
    }

    const priceList = await this.applicableList(
      existing.customerId,
      dto.priceListCode,
    );
    const resolvedId = priceList?.id ?? null;
    const shouldReprice =
      dto.items !== undefined || resolvedId !== existing.priceListId;

    const updated = await this.dataSource.transaction(async (tx) => {
      const quoteRepo = tx.getRepository(QuoteEntity);
      const itemRepo = tx.getRepository(QuoteItemEntity);

      if (shouldReprice) {
        const lines =
          dto.items ??
          (existing.items ?? []).map((i) => ({
            productId: i.productId,
            qty: i.qty,
          }));
        const { items, subtotal, taxTotal } = await this.priceItems(
          lines,
          priceList,
          now,
        );
        await itemRepo.delete({ quoteId: id });
        await itemRepo.save(
          items.map((i) => itemRepo.create({ ...i, quoteId: id })),
        );
        existing.subtotal = subtotal;
        existing.taxTotal = taxTotal;
        existing.grandTotal = round2(subtotal + taxTotal);
      }

      existing.priceListId = resolvedId;
      existing.currency = priceList?.currency ?? 'MXN';
      if (dto.validUntil !== undefined) existing.validUntil = dto.validUntil;
      if (dto.notes !== undefined) existing.notes = dto.notes;
      await quoteRepo.save(existing);

      const full = await quoteRepo.findOne({
        where: { id },
        relations: ['items'],
      });
      if (!full) throw new NotFoundException(`Quote ${id} not found`);
      return full;
    });

    return this.toView(updated, now);
  }

  send(id: string, user: AuthenticatedUser): Promise<QuoteView> {
    return this.transition(id, user, 'send');
  }

  approve(id: string, user: AuthenticatedUser): Promise<QuoteView> {
    return this.transition(id, user, 'approve');
  }

  reject(id: string, user: AuthenticatedUser): Promise<QuoteView> {
    return this.transition(id, user, 'reject');
  }

  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    this.assertRep(user);
    const existing = await this.loadOwned(id, user);
    if (!isEditable(existing.status)) {
      throw new ConflictException(
        `quote in status ${existing.status} can no longer be deleted`,
      );
    }
    await this.quoteRepo.remove(existing);
  }

  /**
   * Turns an approved quote into a draft order at the quoted prices.
   *
   * The status is claimed with a compare-and-set *before* the order is created.
   * Wrapping both in a transaction would be theatre: OrderService.create opens
   * its own, and TypeORM's transaction() always takes a fresh QueryRunner
   * rather than joining an ambient one. Claiming first means two concurrent
   * calls can never produce two orders; the cost is that a failure after the
   * claim leaves `converted` with a null convertedOrderId, which is queryable.
   */
  async convert(id: string, user: AuthenticatedUser): Promise<QuoteView> {
    this.assertRep(user);
    const now = new Date();
    const quote = await this.loadOwned(id, user);

    const claim = await this.quoteRepo.update(
      { id, status: QUOTE_TRANSITIONS.convert.from[0] },
      { status: QUOTE_TRANSITIONS.convert.to },
    );
    if (claim.affected !== 1) {
      throw new ConflictException(
        `quote in status ${quote.status} cannot be converted; only approved quotes can`,
      );
    }

    const payload = plainToInstance(CreateOrderDto, {
      customerId: quote.customerId,
      salesRepId: quote.salesRepId ?? undefined,
      status: 'draft',
      items: (quote.items ?? []).map((i) => ({
        productId: i.productId,
        qty: i.qty,
        unitPrice: i.unitPriceSnapshot,
        tax: i.taxSnapshot,
      })),
    });

    // The in-process call skips the global ValidationPipe, so the same
    // decorators are applied by hand rather than trusting TypeScript alone.
    try {
      await validateOrReject(payload);
    } catch (e) {
      this.logger.error(
        `Quote ${id} produced an invalid order payload`,
        e as Error,
      );
      throw new InternalServerErrorException(
        'quote could not be converted into a valid order',
      );
    }

    const order = await this.orders.createInternal(payload);
    await this.quoteRepo.update({ id }, { convertedOrderId: order.id });

    const full = await this.quoteRepo.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!full) throw new NotFoundException(`Quote ${id} not found`);
    return this.toView(full, now);
  }

  private async transition(
    id: string,
    user: AuthenticatedUser,
    action: QuoteAction,
  ): Promise<QuoteView> {
    this.assertRep(user);
    const now = new Date();
    const quote = await this.loadOwned(id, user);
    const { from, to } = QUOTE_TRANSITIONS[action];

    if (!from.includes(quote.status)) {
      throw new ConflictException(
        `cannot ${action} a quote in status ${quote.status}; expected ${from.join(' or ')}`,
      );
    }
    if (effectiveStatus(quote.status, quote.validUntil, now) === 'expired') {
      throw new ConflictException(`cannot ${action} an expired quote`);
    }

    quote.status = to;
    const saved = await this.quoteRepo.save(quote);
    return this.toView(saved, now);
  }

  /** Read access: admin, owning rep, or the customer the quote is addressed to. */
  private async loadVisible(
    id: string,
    user: AuthenticatedUser,
    now: Date,
  ): Promise<QuoteEntity> {
    const where = buildWhere(user, {}, now);
    if (!where) throw new NotFoundException(`Quote ${id} not found`);

    const found = await this.quoteRepo.findOne({
      where: { ...where, id },
      relations: ['items'],
    });
    // 404 rather than 403: a 403 would confirm the quote exists.
    if (!found) throw new NotFoundException(`Quote ${id} not found`);
    return found;
  }

  /** Write access: admin, or the rep who owns the quote. */
  private async loadOwned(
    id: string,
    user: AuthenticatedUser,
  ): Promise<QuoteEntity> {
    const where: FindOptionsWhere<QuoteEntity> = { id };
    if (!user.roles.includes('quotes:admin'))
      where.salesRepId = user.salesRepId;

    const found = await this.quoteRepo.findOne({ where, relations: ['items'] });
    if (!found) throw new NotFoundException(`Quote ${id} not found`);
    return found;
  }

  private assertRep(user: AuthenticatedUser): string | undefined {
    if (user.roles.includes('quotes:admin'))
      return user.salesRepId ?? undefined;
    if (!user.salesRepId) {
      throw new ForbiddenException(
        'token carries no sales_rep_id claim; quotes are rep-authored',
      );
    }
    return user.salesRepId;
  }

  private async applicableList(
    documentCustomerId: string,
    bodyCode?: string,
  ): Promise<PriceListEntity | null> {
    const profile =
      await this.profiles.findByAuthCustomerId(documentCustomerId);
    return this.priceLists.findApplicableOrNull(
      documentPriceListCode({
        honorBodyCode: true,
        bodyCode,
        profileCode: profile?.priceListCode,
      }),
    );
  }

  private async priceItems(
    lines: CreateQuoteItemDto[],
    priceList: PriceListEntity | null,
    now: Date,
  ): Promise<{
    items: Partial<QuoteItemEntity>[];
    subtotal: number;
    taxTotal: number;
  }> {
    const products = await this.loadProducts(lines.map((l) => l.productId));

    let subtotal = 0;
    let taxTotal = 0;
    const items: Partial<QuoteItemEntity>[] = [];

    const taxRate = this.config.get('tax.rate', { infer: true });

    for (const line of lines) {
      const product = products.get(line.productId)!;
      const priced = priceList
        ? await this.resolvePrice(priceList.id, line.productId, line.qty, now)
        : this.cataloguePrice(product);

      // Tax is computed, never echoed from the request. A rep could otherwise
      // quote tax 0, approve it, and convert it into an order that carries the
      // snapshot — reopening from inside the hole `create` closes at the edge.
      const { net, tax, lineTotal } = priceLine({
        qty: line.qty,
        unitPrice: priced.price,
        taxRate,
      });
      subtotal = round2(subtotal + net);
      taxTotal = round2(taxTotal + tax);

      items.push({
        productId: line.productId,
        priceListItemId: priced.id,
        skuSnapshot: product.sku,
        nameSnapshot: product.name ?? product.sku,
        qty: line.qty,
        unitPriceSnapshot: priced.price,
        taxSnapshot: tax,
        lineTotal,
      });
    }

    return { items, subtotal, taxTotal };
  }

  private cataloguePrice(product: ProductEntity): { id?: string; price: number } {
    if (product.price == null) {
      throw new UnprocessableEntityException(
        `no applicable price for product ${product.id}`,
      );
    }
    return { price: product.price };
  }

  /**
   * An unpriceable line is not a missing resource — the product exists, the
   * price list just does not cover it at that quantity. 422, not the 404 the
   * resolver raises for its own callers.
   */
  private async resolvePrice(
    priceListId: string,
    productId: number,
    qty: number,
    now: Date,
  ) {
    try {
      return await this.priceListItems.resolveApplicablePrice(
        priceListId,
        productId,
        qty,
        now,
      );
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new UnprocessableEntityException(e.message);
      }
      throw e;
    }
  }

  private async loadProducts(
    ids: number[],
  ): Promise<Map<number, ProductEntity>> {
    const products = await this.productRepo.find({ where: { id: In(ids) } });
    const map = new Map(products.map((p) => [p.id, p]));
    for (const id of ids) {
      if (!map.has(id)) throw new NotFoundException(`Product ${id} not found`);
    }
    return map;
  }

  private toView(quote: QuoteEntity, now: Date): QuoteView {
    return {
      ...quote,
      status: effectiveStatus(quote.status, quote.validUntil, now),
    };
  }

  private generateQuoteNumber(): string {
    return `QUO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
