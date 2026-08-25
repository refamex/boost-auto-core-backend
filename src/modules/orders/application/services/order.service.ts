import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
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
import { buildWhere } from '../../domain/order-visibility';
import {
  CreateOrderDto,
  CreateOrderPaymentDto,
  OrderQueryDto,
  UpdateOrderDto,
} from '../../infrastructure/http/dto/order.dto';

@Injectable()
export class OrderService {
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
   * `actor` is used only to default the contact email from the JWT claim. It
   * stays optional so in-process callers can keep supplying contact via DTO.
   */
  async create(
    dto: CreateOrderDto,
    actor?: AuthenticatedUser,
  ): Promise<OrderEntity> {
    const created = await this.dataSource.transaction(async (tx) => {
      const products = await this.loadProducts(
        dto.items.map((i) => i.productId),
      );
      const { subtotal, taxTotal, items } = this.buildItems(dto, products);

      const order = await tx.getRepository(OrderEntity).save(
        tx.getRepository(OrderEntity).create({
          orderNumber: this.generateOrderNumber(),
          customerId: dto.customerId,
          salesRepId: dto.salesRepId,
          providerBranchId: dto.providerBranchId,
          status: dto.status ?? 'draft',
          // Contact is frozen onto the order because the notification triggers
          // that matter most — the Polar and Skydropx webhooks — run with no
          // user context at all. Without this there is nobody to write to.
          shipToName: dto.shipToName,
          shipToPhone: dto.shipToPhone,
          shipToEmail: dto.shipToEmail ?? actor?.email,
          subtotal,
          taxTotal,
          grandTotal: subtotal + taxTotal,
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

  private buildItems(
    dto: CreateOrderDto,
    products: Map<number, ProductEntity>,
  ): { subtotal: number; taxTotal: number; items: Partial<OrderItemEntity>[] } {
    let subtotal = 0;
    let taxTotal = 0;
    const items: Partial<OrderItemEntity>[] = [];

    for (const line of dto.items) {
      const product = products.get(line.productId)!;
      const tax = line.tax ?? 0;
      const lineTotal = line.qty * line.unitPrice + tax;
      subtotal += line.qty * line.unitPrice;
      taxTotal += tax;
      items.push({
        productId: line.productId,
        skuSnapshot: product.sku,
        nameSnapshot: product.name ?? product.sku,
        qty: line.qty,
        unitPriceSnapshot: line.unitPrice,
        taxSnapshot: tax,
        lineTotal,
      });
    }

    return { subtotal, taxTotal, items };
  }

  private generateOrderNumber(): string {
    return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}
