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
import { documentPriceListCode } from '../../../commerce/domain/document-price-list-code';
import { PriceListEntity } from '../../../commerce/domain/entities/price-list.entity';
import { CustomerProfileService } from '../../../customers/application/services/customer-profile.service';
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
import { OrderStatusEventEntity } from '../../domain/entities/order-status-event.entity';
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
  tierOf,
} from '../../domain/order-visibility';
import {
  CreateOrderDto,
  CreateOrderPaymentDto,
  OrderQueryDto,
  PreviewOrderDto,
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

/** Where a resolved price came from. `unavailable` only ever reaches a preview. */
export type PriceSource = 'price-list' | 'catalogue' | 'unavailable';

interface ResolvedUnitPrice {
  unitPrice: number;
  source: Exclude<PriceSource, 'unavailable'>;
}

/**
 * All `priceLines` ever reads off an order. Narrower than `CreateOrderDto` so
 * the preview can reuse the pricing path without inventing a shipping address
 * and a customer id it does not have.
 */
interface PriceableOrder {
  customerId: string;
  priceListCode?: string;
  items: { productId: number; qty: number; unitPrice?: number; tax?: number }[];
}

export interface PreviewedOrder {
  items: {
    productId: number;
    qty: number;
    unitPrice: number;
    source: PriceSource;
  }[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
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
    @InjectRepository(OrderStatusEventEntity)
    private readonly statusEvents: Repository<OrderStatusEventEntity>,
    private readonly profiles: CustomerProfileService,
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
    return this.persist(dto, bound, 'server', actor.email, actor);
  }

  /**
   * Prices a cart without creating anything.
   *
   * Exists so a caller can *display* the price it is about to be charged
   * instead of guessing it. A client that resolves prices on its own has to
   * reimplement the price list cascade, and the moment the two drift apart
   * `priceLines` rejects the order with a 409 the user cannot act on.
   *
   * Same ownership rule as `create` — `bindCreate`, not a new one — so a
   * customer cannot price another customer's cart. Read-only: no transaction,
   * no stock, nothing persisted.
   */
  async preview(
    dto: PreviewOrderDto,
    actor: AuthenticatedUser,
  ): Promise<PreviewedOrder> {
    if (!actor) {
      throw new ForbiddenException(
        'order preview requires an authenticated caller',
      );
    }
    if (!bindCreate(actor, dto)) {
      throw new ForbiddenException(
        'customerId must match the authenticated customer',
      );
    }

    const products = await this.loadProducts(dto.items.map((i) => i.productId));
    const priceList = await this.applicableList(
      dto.customerId,
      tierOf(actor) !== 'customer',
      dto.priceListCode,
    );
    // One instant for the whole cart, as in `priceLines`: two lines must never
    // straddle a price list's validity boundary.
    const asOf = new Date();
    const taxRate = this.config.get('tax.rate', { infer: true });

    let subtotal = 0;
    let taxTotal = 0;
    const items: PreviewedOrder['items'] = [];

    for (const line of dto.items) {
      const product = products.get(line.productId)!;
      const resolved = await this.tryResolveUnitPrice(
        priceList,
        product,
        line.qty,
        asOf,
      );

      // An unpriceable line is reported, not thrown: `create` still rejects it
      // with a 422, but a preview that dies on one bad line cannot tell the
      // caller which line to remove.
      if (!resolved) {
        items.push({
          productId: line.productId,
          qty: line.qty,
          unitPrice: 0,
          source: 'unavailable',
        });
        continue;
      }

      const { net, tax } = priceLine({
        qty: line.qty,
        unitPrice: resolved.unitPrice,
        taxRate,
      });
      subtotal = round2(subtotal + net);
      taxTotal = round2(taxTotal + tax);
      items.push({
        productId: line.productId,
        qty: line.qty,
        unitPrice: resolved.unitPrice,
        source: resolved.source,
      });
    }

    return {
      items,
      subtotal,
      taxTotal,
      grandTotal: round2(subtotal + taxTotal),
    };
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
    actor?: AuthenticatedUser,
  ): Promise<OrderEntity> {
    // Priced before the transaction opens: resolution is read-only and can
    // reject (409/422), and holding a write transaction open across those
    // lookups buys nothing.
    const products = await this.loadProducts(dto.items.map((i) => i.productId));
    const { subtotal, taxTotal, items } =
      pricing === 'server'
        ? await this.priceLines(dto, products, actor!)
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

      // El primer punto de la línea de tiempo. Sin él, el historial arranca en
      // la segunda transición y una orden recién creada se ve como si nadie la
      // hubiera creado.
      await tx.getRepository(OrderStatusEventEntity).save(
        tx.getRepository(OrderStatusEventEntity).create({
          orderId: order.id,
          fromStatus: null,
          toStatus: order.status,
          actorId: actor?.id ?? null,
          actorEmail: actor?.email ?? contactEmail ?? null,
        }),
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

  async confirm(id: string, actor?: AuthenticatedUser): Promise<OrderEntity> {
    const order = await this.loadForWrite(id);
    if (order.status === 'confirmed') {
      throw new ConflictException('order is already confirmed');
    }
    if (order.status === 'cancelled') {
      throw new ConflictException('cannot confirm a cancelled order');
    }
    await this.reserveForOrder(order);
    const saved = await this.transitionTo(order, 'confirmed', actor);
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
  async prepare(id: string, actor?: AuthenticatedUser): Promise<OrderEntity> {
    const order = await this.loadForWrite(id);
    if (order.status === 'cancelled') {
      throw new ConflictException('cannot prepare a cancelled order');
    }
    if (order.status !== 'confirmed') {
      throw new ConflictException(
        `cannot prepare an order in status ${order.status}; confirm it first`,
      );
    }
    const saved = await this.transitionTo(order, 'preparing', actor);
    this.emit('order.preparing', saved);
    return saved;
  }

  async cancel(id: string, actor?: AuthenticatedUser): Promise<OrderEntity> {
    const order = await this.loadForWrite(id);
    if (order.status === 'cancelled') {
      throw new ConflictException('order is already cancelled');
    }
    // `preparing` holds the same reservation `confirmed` does, so it has to
    // release it too — otherwise cancelling a packed order silently strands stock.
    if (order.status === 'confirmed' || order.status === 'preparing') {
      await this.releaseForOrder(order);
    }
    const saved = await this.transitionTo(order, 'cancelled', actor);
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
  /**
   * Moves an order to a new status and records who did it, atomically.
   *
   * ONE TRANSACTION, and that is the whole point. A history row that can
   * survive a failed status change describes a transition that never happened;
   * a status change that can outlive its event leaves a gap in the trail. An
   * audit log that is only usually right is not an audit log.
   *
   * `actor` is optional because not every transition comes from a person: the
   * Polar webhook confirms orders with no user context. Recording a null actor
   * is honest; inventing one to satisfy a column would not be.
   */
  private async transitionTo(
    order: OrderEntity,
    toStatus: string,
    actor?: AuthenticatedUser,
  ): Promise<OrderEntity> {
    const fromStatus = order.status;

    return this.dataSource.transaction(async (tx) => {
      order.status = toStatus;
      const saved = await tx.getRepository(OrderEntity).save(order);

      await tx.getRepository(OrderStatusEventEntity).save(
        tx.getRepository(OrderStatusEventEntity).create({
          orderId: saved.id,
          fromStatus,
          toStatus,
          actorId: actor?.id ?? null,
          // Frozen, not resolved on read: the address recorded is the one in
          // use when it happened, even if that person changes it later.
          actorEmail: actor?.email ?? null,
        }),
      );

      return saved;
    });
  }

  /**
   * The trail for one order, oldest first.
   *
   * Scoped through the same ownership predicate as `findById`: the history of
   * an order must never be more visible than the order itself.
   */
  async listStatusEvents(
    id: string,
    caller: AuthenticatedUser,
  ): Promise<OrderStatusEventEntity[]> {
    await this.findById(id, caller);
    return this.statusEvents.find({
      where: { orderId: id },
      order: { occurredAt: 'ASC' },
    });
  }

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

  private async applicableList(
    documentCustomerId: string,
    honorBodyCode: boolean,
    bodyCode?: string,
  ): Promise<PriceListEntity | null> {
    const profile =
      await this.profiles.findByAuthCustomerId(documentCustomerId);
    return this.priceLists.findApplicableOrNull(
      documentPriceListCode({
        honorBodyCode,
        bodyCode,
        profileCode: profile?.priceListCode,
      }),
    );
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
    dto: PriceableOrder,
    products: Map<number, ProductEntity>,
    actor: AuthenticatedUser,
  ): Promise<PricedOrder> {
    // One list per order, not per line, so a misconfigured catalogue reports
    // itself plainly instead of as an unpriceable product (as in QuoteService).
    const priceList = await this.applicableList(
      dto.customerId,
      tierOf(actor) !== 'customer',
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
   * every SKU has a list entry. `null` means neither could price it.
   *
   * Split out of `resolveUnitPrice` so the preview can report *which* line is
   * unpriceable instead of failing the whole cart: creating an order with an
   * unpriceable line is an error, but a cashier still has to see which of the
   * items in front of them is the problem.
   */
  private async tryResolveUnitPrice(
    priceList: PriceListEntity | null,
    product: ProductEntity,
    qty: number,
    asOf: Date,
  ): Promise<ResolvedUnitPrice | null> {
    if (priceList) {
      const priced = await this.priceListItems.tryResolveApplicablePrice(
        priceList.id,
        product.id,
        qty,
        asOf,
      );
      if (priced) return { unitPrice: priced.price, source: 'price-list' };
    }

    const catalogue = product.price;
    if (typeof catalogue === 'number' && Number.isFinite(catalogue)) {
      return { unitPrice: catalogue, source: 'catalogue' };
    }

    return null;
  }

  /**
   * Same resolution, but a product priced by neither is a 422 — never a zero,
   * which would be a free order.
   */
  private async resolveUnitPrice(
    priceList: PriceListEntity | null,
    product: ProductEntity,
    qty: number,
    asOf: Date,
  ): Promise<number> {
    const resolved = await this.tryResolveUnitPrice(
      priceList,
      product,
      qty,
      asOf,
    );
    if (resolved) return resolved.unitPrice;

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
