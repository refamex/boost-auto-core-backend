import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, In, Repository } from 'typeorm';
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
  ) {}

  list(query: OrderQueryDto): Promise<OrderEntity[]> {
    const where: FindOptionsWhere<OrderEntity> = {};
    if (query.customerId) where.customerId = query.customerId;
    if (query.status) where.status = query.status;
    return this.orderRepo.find({
      where,
      relations: ['items', 'items.product', 'payments'],
      order: { placedAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<OrderEntity> {
    const found = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'items.product', 'payments', 'providerBranch'],
    });
    if (!found) throw new NotFoundException(`Order ${id} not found`);
    return found;
  }

  async create(dto: CreateOrderDto): Promise<OrderEntity> {
    return this.dataSource.transaction(async (tx) => {
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
  }

  async update(id: string, dto: UpdateOrderDto): Promise<OrderEntity> {
    const existing = await this.findById(id);
    return this.orderRepo.save(this.orderRepo.merge(existing, dto));
  }

  async confirm(id: string): Promise<OrderEntity> {
    const order = await this.findById(id);
    if (order.status === 'confirmed') {
      throw new ConflictException('order is already confirmed');
    }
    if (order.status === 'cancelled') {
      throw new ConflictException('cannot confirm a cancelled order');
    }
    await this.reserveForOrder(order);
    order.status = 'confirmed';
    return this.orderRepo.save(order);
  }

  async cancel(id: string): Promise<OrderEntity> {
    const order = await this.findById(id);
    if (order.status === 'cancelled') {
      throw new ConflictException('order is already cancelled');
    }
    if (order.status === 'confirmed') {
      await this.releaseForOrder(order);
    }
    order.status = 'cancelled';
    return this.orderRepo.save(order);
  }

  async addPayment(
    orderId: string,
    dto: CreateOrderPaymentDto,
  ): Promise<OrderPaymentEntity> {
    await this.findById(orderId);
    return this.paymentRepo.save(this.paymentRepo.create({ orderId, ...dto }));
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
