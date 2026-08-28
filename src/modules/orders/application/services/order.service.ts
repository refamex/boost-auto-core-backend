import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { AppConfig } from '../../../../shared/config/configuration';
import { PriceListItemService } from '../../../commerce/application/services/price-list-item.service';
import { PriceListService } from '../../../commerce/application/services/price-list.service';
import { PriceListEntity } from '../../../commerce/domain/entities/price-list.entity';
import { NotificationEmittedEvent } from '../../../notifications/domain/notification-emitted.event';
import { NotificationEventKey } from '../../../notifications/domain/notification-event';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import {
  INVENTORY_REPOSITORY,
  InventoryRepository,
} from '../../../inventory/application/ports/inventory.repository';
import { ReleaseStockUseCase } from '../../../inventory/application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from '../../../inventory/application/use-cases/reserve-stock.use-case';
import { OrderItemEntity } from '../../domain/entities/order-item.entity';
import { OrderPaymentEntity } from '../../domain/entities/order-payment.entity';
import { OrderEntity } from '../../domain/entities/order.entity';
import {
  priceLine,
  quotedPriceMatches,
  round2,
} from '../../domain/order-pricing';
import {
  bindCreate,
  buildWhere,
  OrderCreateBinding,
} from '../../domain/order-visibility';
import {
  CreateOrderDto,
  CreateOrderPaymentDto,
  OrderQueryDto,
  UpdateOrderDto,
} from '../../infrastructure/http/dto/order.dto';

/**
 * Where a line's unit price comes from.
 *
 * `server` — untrusted HTTP caller: resolve every price from the price list or
 * the catalogue and verify anything the caller claimed.
 * `snapshot` — trusted in-process caller (`QuoteService.convert`): keep the
 * approved quote's frozen prices, which `QuoteService` already resolved
 * server-side. Re-pricing here would discard the negotiated amount the
 * customer accepted.
 */
type PricingMode = 'server' | 'snapshot';

interface PricedOrder {
  subtotal: number;
  taxTotal: number;
  items: Partial<OrderItemEntity>[];
}

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly itemRepo: Repository<OrderItemEntity>,
    @InjectRepository(OrderPaymentEntity)
    private readonly paymentRepo: Repository<OrderPaymentEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    private readonly dataSource: DataSource,
    private readonly reserveStock: ReserveStockUseCase,
    private readonly releaseStock: ReleaseStockUseCase,
    @Inject(INVENTORY_REPOSITORY)
    private readonly inventoryRepo: InventoryRepository,
    private readonly events: EventEmitter2,
    private readonly priceLists: PriceListService,
    private readonly priceListItems: PriceListItemService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Announces an order transition.
   *
   * Fire-and-forget on purpose: nothing in the order flow should fail because a
   * notification could not be recorded. The listener does its own error
   * handling and the outbox owns retries.
   */
  private emit(eventKey: NotificationEventKey, order: OrderEntity): void {
    const payload: NotificationEmittedEvent = {
      eventKey,
      recipientUserId: order.customerId,
      entityType: 'order',
      entityId: order.id,
      reference: order.orderNumber,
      contact: { email: order.shipToEmail, phone: order.shipToPhone },
    };
    this.events.emit(eventKey, payload);
  }

  list(user: AuthenticatedUser, query: OrderQueryDto): Promise<OrderEntity[]> {
    const where = buildWhere(user, query);
    if (!where) return Promise.resolve([]);
    return this.orderRepo.find({
      where,
      relations: ['items', 'items.product', 'payments'],
      order: { placedAt: 'DESC' },
    });
  }

  findById(id: string, user: AuthenticatedUser): Promise<OrderEntity> {
    return this.loadVisible(id, user);
  }

  /**
   * HTTP entry point. `actor` is REQUIRED: the ownership binding IS the
   * security boundary (F1/F8/F10). A caller with no actor, or a customer
   * caller whose `customerId` doesn't match their own id, is rejected with
   * 403 before any row is written — a create asserts the caller's own
   * identity rather than probing another's row, so there is nothing to
   * conceal (unlike the read path, which answers 404/empty page instead).
   */
  async create(
    dto: CreateOrderDto,
    actor: AuthenticatedUser,
  ): Promise<OrderEntity> {
    if (!actor) {
      throw new ForbiddenException(
        'order creation requires an authenticated caller',
      );
    }
    const bound = bindCreate(actor, dto);
    if (!bound) {
      throw new ForbiddenException(
        'customerId must match the authenticated customer',
      );
    }
    return this.persist(dto, bound, 'server', actor.email);
  }

  /**
   * In-process entry point. There is no HTTP actor here: `QuoteService.convert`
   * creates the order on behalf of the quote's customer, who is not the
   * caller — the caller already authorized itself (`assertRep` + `loadOwned`).
   * No binding is applied and no contact email is defaulted, so the acting
   * rep's address can never be frozen onto the customer's order (Defect B).
   */
  createInternal(dto: CreateOrderDto): Promise<OrderEntity> {
    return this.persist(
      dto,
      { customerId: dto.customerId, status: dto.status ?? 'draft' },
      'snapshot',
      undefined,
    );
  }

  private async persist(
    dto: CreateOrderDto,
    bound: OrderCreateBinding,
    pricing: PricingMode,
    contactEmail?: string,
  ): Promise<OrderEntity> {
    // Priced before the transaction opens: resolution is read-only and can
    // reject (409/422), and holding a write transaction open across those
    // lookups buys nothing.
    const products = await this.loadProducts(dto.items.map((i) => i.productId));
    const { subtotal, taxTotal, items } =
      pricing === 'server'
        ? await this.priceLines(dto, products)
        : this.snapshotLines(dto, products);

    const created = await this.dataSource.transaction(async (tx) => {
      const order = await tx.getRepository(OrderEntity).save(
        tx.getRepository(OrderEntity).create({
          orderNumber: this.generateOrderNumber(),
          customerId: bound.customerId,
          salesRepId: dto.salesRepId,
          providerBranchId: dto.providerBranchId,
          status: bound.status,
          // Contact is frozen onto the order because the notification triggers
          // that matter most — the Polar and Skydropx webhooks — run with no
          // user context at all. Without this there is nobody to write to.
          shipToName: dto.shipToName,
          shipToPhone: dto.shipToPhone,
          shipToEmail: dto.shipToEmail ?? contactEmail,
          subtotal,
          taxTotal,
          grandTotal: round2(subtotal + taxTotal),
          discountTotal: 0,
          shippingTotal: 0,
        }),
      );

      await tx
        .getRepository(OrderItemEntity)
        .save(
          items.map((item) =>
            tx
              .getRepository(OrderItemEntity)
              .create({ ...item, orderId: order.id }),
          ),
        );

      const full = await tx.getRepository(OrderEntity).findOne({
        where: { id: order.id },
        relations: ['items', 'items.product'],
      });
      if (!full) throw new NotFoundException(`Order ${order.id} not found`);

      if (full.status === 'confirmed') {
        await this.reserveForOrder(full);
      }

      return full;
    });

    // Emitted after the transaction commits: a listener must never observe an
    // order that a rollback is about to erase.
    this.emit('order.placed', created);
    if (created.status === 'confirmed') this.emit('order.confirmed', created);
    return created;
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const existing = await this.loadForWrite(id);
    return this.orderRepo.save(this.orderRepo.merge(existing, dto));
  }

  async confirm(id: string): Promise<OrderEntity> {
    const order = await this.loadForWrite(id);
    if (order.status === 'confirmed') {
      throw new ConflictException('order is already confirmed');
    }
    if (order.status === 'cancelled') {
      throw new ConflictException('cannot confirm a cancelled order');
    }
    await this.reserveForOrder(order);
    order.status = 'confirmed';
    const saved = await this.orderRepo.save(order);
    this.emit('order.confirmed', saved);
    return saved;
  }

  /**
   * Marks the order as being picked and packed.
   *
   * This state did not exist: the gap between `confirmed` and a shipment being
   * created was unmodelled, while the storefront was already deriving and
   * showing "En preparación". Now it is a real transition somebody performs,
   * and one the customer is told about.
   */
  async prepare(id: string): Promise<OrderEntity> {
    const order = await this.loadForWrite(id);
    if (order.status === 'cancelled') {
      throw new ConflictException('cannot prepare a cancelled order');
    }
    if (order.status !== 'confirmed') {
      throw new ConflictException(
        `cannot prepare an order in status ${order.status}; confirm it first`,
      );
    }
    order.status = 'preparing';
    const saved = await this.orderRepo.save(order);
    this.emit('order.preparing', saved);
    return saved;
  }

  async cancel(id: string): Promise<OrderEntity> {
    const order = await this.loadForWrite(id);
    if (order.status === 'cancelled') {
      throw new ConflictException('order is already cancelled');
    }
    // `preparing` holds the same reservation `confirmed` does, so it has to
    // release it too — otherwise cancelling a packed order silently strands stock.
    if (order.status === 'confirmed' || order.status === 'preparing') {
      await this.releaseForOrder(order);
    }
    order.status = 'cancelled';
    const saved = await this.orderRepo.save(order);
    this.emit('order.cancelled', saved);
    return saved;
  }

  async addPayment(
    orderId: string,
    dto: CreateOrderPaymentDto,
  ): Promise<OrderPaymentEntity> {
    await this.loadForWrite(orderId);
    return this.paymentRepo.save(this.paymentRepo.create({ orderId, ...dto }));
  }

  /** Read access: ownership-scoped, per `order-visibility.buildWhere`. */
  private async loadVisible(
    id: string,
    user: AuthenticatedUser,
  ): Promise<OrderEntity> {
    const where = buildWhere(user, {});
    if (!where) throw new NotFoundException(`Order ${id} not found`);

    const found = await this.orderRepo.findOne({
      where: { ...where, id },
      relations: ['items', 'items.product', 'payments', 'providerBranch'],
    });
    // 404 rather than 403: a 403 would confirm the order exists.
    if (!found) throw new NotFoundException(`Order ${id} not found`);
    return found;
  }

  /**
   * Write access: unscoped, today's pre-existing behavior for the five
   * `@Roles('orders:write')` staff routes (`update`, `confirm`, `prepare`,
   * `cancel`, `addPayment`). Ownership-based write authorization is
   * deliberately out of scope for this change (D2).
   */
  private async loadForWrite(id: string): Promise<OrderEntity> {
    const found = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'items.product', 'payments', 'providerBranch'],
    });
    if (!found) throw new NotFoundException(`Order ${id} not found`);
    return found;
  }

  private async reserveForOrder(order: OrderEntity): Promise<void> {
    if (!order.providerBranchId) {
      throw new BadRequestException(
        'providerBranchId is required to reserve inventory',
      );
    }
    if (!order.items?.length) return;

    for (const item of order.items) {
      const inv = await this.inventoryRepo.findBySkuAndBranch(
        item.skuSnapshot,
        order.providerBranchId,
      );
      if (!inv) {
        throw new NotFoundException(
          `inventory not found for sku ${item.skuSnapshot} at branch ${order.providerBranchId}`,
        );
      }
      await this.reserveStock.execute(inv.id, Math.ceil(item.qty));
    }
  }

  private async releaseForOrder(order: OrderEntity): Promise<void> {
    if (!order.providerBranchId || !order.items?.length) return;

    for (const item of order.items) {
      const inv = await this.inventoryRepo.findBySkuAndBranch(
        item.skuSnapshot,
        order.providerBranchId,
      );
      if (!inv) continue;
      await this.releaseStock.execute(inv.id, Math.ceil(item.qty));
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

  /**
   * Prices an order for an untrusted caller.
   *
   * Every unit price is resolved here. `line.unitPrice` is only ever *checked*
   * against the result, and `line.tax` is discarded outright — before this, both
   * were copied straight into `grand_total`, which `PolarCheckoutService`
   * charges verbatim.
   */
  private async priceLines(
    dto: CreateOrderDto,
    products: Map<number, ProductEntity>,
  ): Promise<PricedOrder> {
    // One list per order, not per line, so a misconfigured catalogue reports
    // itself plainly instead of as an unpriceable product (as in QuoteService).
    const priceList = await this.priceLists.findApplicableOrNull(
      dto.priceListCode,
    );
    // A single instant for the whole order: two lines of the same order must
    // never straddle a price list's validity boundary.
    const asOf = new Date();
    const taxRate = this.config.get('tax.rate', { infer: true });

    if (dto.items.some((line) => line.tax !== undefined)) {
      this.logger.warn(
        'order create supplied a tax amount; ignoring it and computing tax server-side',
      );
    }

    let subtotal = 0;
    let taxTotal = 0;
    const items: Partial<OrderItemEntity>[] = [];

    for (const line of dto.items) {
      const product = products.get(line.productId)!;
      const unitPrice = await this.resolveUnitPrice(
        priceList,
        product,
        line.qty,
        asOf,
      );

      // A caller that named a price is telling us what it displayed. If that
      // disagrees, its cart is stale (or forged) and it must be sent back to
      // refresh — charging a different amount than the one shown is not an
      // option, and neither is charging the one it claimed.
      if (
        line.unitPrice !== undefined &&
        !quotedPriceMatches(line.unitPrice, unitPrice)
      ) {
        throw new ConflictException(
          `price for ${product.sku} changed to ${unitPrice}; refresh the cart and retry`,
        );
      }

      const { net, tax, lineTotal } = priceLine({
        qty: line.qty,
        unitPrice,
        taxRate,
      });
      subtotal = round2(subtotal + net);
      taxTotal = round2(taxTotal + tax);
      items.push({
        productId: line.productId,
        skuSnapshot: product.sku,
        nameSnapshot: product.name ?? product.sku,
        qty: line.qty,
        unitPriceSnapshot: unitPrice,
        taxSnapshot: tax,
        lineTotal,
      });
    }

    return { subtotal, taxTotal, items };
  }

  /**
   * The price list wins where it covers the product; `pim.product.price` is the
   * fallback, because the storefront catalogue is priced there today and not
   * every SKU has a list entry. A product priced by neither is a 422 — never a
   * zero, which would be a free order.
   */
  private async resolveUnitPrice(
    priceList: PriceListEntity | null,
    product: ProductEntity,
    qty: number,
    asOf: Date,
  ): Promise<number> {
    if (priceList) {
      const priced = await this.priceListItems.tryResolveApplicablePrice(
        priceList.id,
        product.id,
        qty,
        asOf,
      );
      if (priced) return priced.price;
    }

    const catalogue = product.price;
    if (typeof catalogue === 'number' && Number.isFinite(catalogue)) {
      return catalogue;
    }

    throw new UnprocessableEntityException(
      `product ${product.id} (${product.sku}) has no price` +
        (priceList ? ` in price list ${priceList.code} or the catalogue` : ''),
    );
  }

  /**
   * Keeps a trusted caller's already-resolved prices. Only `QuoteService`
   * reaches this, via `createInternal`, carrying an approved quote's snapshot.
   */
  private snapshotLines(
    dto: CreateOrderDto,
    products: Map<number, ProductEntity>,
  ): PricedOrder {
    let subtotal = 0;
    let taxTotal = 0;
    const items: Partial<OrderItemEntity>[] = [];

    for (const line of dto.items) {
      const product = products.get(line.productId)!;
      if (line.unitPrice === undefined) {
        // Unreachable from a quote, which always snapshots a price. Guarded
        // anyway: `unitPrice` is optional on the DTO now, and defaulting it to
        // zero here would silently produce a free order.
        throw new UnprocessableEntityException(
          `internal order line for product ${product.id} carries no unit price`,
        );
      }

      const net = round2(line.qty * line.unitPrice);
      const tax = round2(line.tax ?? 0);
      subtotal = round2(subtotal + net);
      taxTotal = round2(taxTotal + tax);
      items.push({
        productId: line.productId,
        skuSnapshot: product.sku,
        nameSnapshot: product.name ?? product.sku,
        qty: line.qty,
        unitPriceSnapshot: line.unitPrice,
        taxSnapshot: tax,
        lineTotal: round2(net + tax),
      });
    }

    return { subtotal, taxTotal, items };
  }

  private generateOrderNumber(): string {
    return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
