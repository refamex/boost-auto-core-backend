import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { AppConfig } from '../../../../shared/config/configuration';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { tierOf } from '../../../orders/domain/order-visibility';
import { TERMINAL_CHECKOUT_STATUSES } from '../../domain/checkout-status';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { POLAR_CLIENT, PolarClient } from '../ports/polar.client';

@Injectable()
export class PolarCheckoutService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(POLAR_CLIENT) private readonly polar: PolarClient,
    @InjectRepository(PolarCheckoutEntity)
    private readonly checkoutRepo: Repository<PolarCheckoutEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) {}

  private assertEnabled(): void {
    if (!this.config.get('polar.enabled', { infer: true })) {
      throw new ServiceUnavailableException(
        'Polar payments are not enabled (POLAR_ENABLED=false)',
      );
    }
  }

  private async findVisibleOrder(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<OrderEntity> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order || (tierOf(user) !== 'admin' && order.customerId !== user.id)) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return order;
  }

  async createForOrder(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<PolarCheckoutEntity> {
    this.assertEnabled();

    const order = await this.findVisibleOrder(orderId, user);
    if (order.grandTotal <= 0) {
      throw new BadRequestException(
        'Order grandTotal must be greater than zero',
      );
    }
    if (order.paymentStatus === 'paid') {
      throw new ConflictException('Order is already paid');
    }

    // The freight guard. `grand_total` includes shipping only once a rate has
    // been accepted, and `shipping_quoted_at` is the only thing that says so.
    // Without this check, posting straight to this endpoint — skipping the
    // quote screen entirely — charges `subtotal + tax` and ships for free,
    // which is exactly what production did on every order until now.
    //
    // Checked on the order rather than `shipping_total > 0`: a genuinely free
    // shipment and an unquoted one are both zero, and only one of them may be
    // charged.
    if (order.shippingQuotedAt == null) {
      throw new ConflictException(
        'Shipping has not been quoted for this order. Accept a shipping rate before paying.',
      );
    }

    const open = await this.checkoutRepo.findOne({
      where: { orderId, status: Not(In(TERMINAL_CHECKOUT_STATUSES)) },
      order: { createdAt: 'DESC' },
    });
    if (open) {
      throw new ConflictException(
        'An open Polar checkout already exists for this order',
      );
    }

    const currency = this.config.get('polar.currency', { infer: true });
    const polarResult = await this.polar.createCheckout({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      amountCents: Math.round(order.grandTotal * 100),
      currency,
    });

    return this.checkoutRepo.save(
      this.checkoutRepo.create({
        orderId: order.id,
        polarCheckoutId: polarResult.polarCheckoutId,
        status: polarResult.status,
        checkoutUrl: polarResult.checkoutUrl,
        amount: order.grandTotal,
        currency: currency.toUpperCase(),
      }),
    );
  }

  async findLatestByOrder(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<PolarCheckoutEntity> {
    await this.findVisibleOrder(orderId, user);
    const found = await this.checkoutRepo.findOne({
      where: { orderId },
      order: { createdAt: 'DESC' },
    });
    if (!found)
      throw new NotFoundException(`No Polar checkout for order ${orderId}`);
    return found;
  }

  async findById(id: string): Promise<PolarCheckoutEntity> {
    const found = await this.checkoutRepo.findOne({
      where: { id },
      relations: ['order'],
    });
    if (!found) throw new NotFoundException(`PolarCheckout ${id} not found`);
    return found;
  }
}
