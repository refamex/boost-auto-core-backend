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
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { PolarCheckoutEntity } from '../../domain/entities/polar-checkout.entity';
import { POLAR_CLIENT, PolarClient } from '../ports/polar.client';

const TERMINAL_CHECKOUT_STATUSES = [
  'succeeded',
  'confirmed',
  'expired',
  'failed',
];

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

  async createForOrder(orderId: string): Promise<PolarCheckoutEntity> {
    this.assertEnabled();

    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);
    if (order.grandTotal <= 0) {
      throw new BadRequestException(
        'Order grandTotal must be greater than zero',
      );
    }
    if (order.paymentStatus === 'paid') {
      throw new ConflictException('Order is already paid');
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

  async findLatestByOrder(orderId: string): Promise<PolarCheckoutEntity> {
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
