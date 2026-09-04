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
import { ProductDimensionEntity } from '../../../pim/domain/entities/product-dimension.entity';
import { OrderItemEntity } from '../../../orders/domain/entities/order-item.entity';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { orderGrandTotal, round2 } from '../../../orders/domain/order-pricing';
import { tierOf } from '../../../orders/domain/order-visibility';
import { TERMINAL_CHECKOUT_STATUSES } from '../../../payments/domain/checkout-status';
import { PolarCheckoutEntity } from '../../../payments/domain/entities/polar-checkout.entity';
import { parcelFromLines, ParcelLine } from '../../domain/parcel-from-lines';
import {
  NoShippingCoverageError,
  ParcelNotComputableError,
} from '../../domain/shipping-errors';
import { buildOrderWhere } from '../../domain/shipping-visibility';
import {
  QuoteResult,
  SKYDROPX_CLIENT,
  SkydropxAddress,
  SkydropxClient,
  SkydropxParcel,
  SkydropxRate,
} from '../ports/skydropx.client';

export interface QuoteOverride {
  destination?: Partial<SkydropxAddress>;
  parcel?: Partial<SkydropxParcel>;
}

@Injectable()
export class ShippingQuoteService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    @Inject(SKYDROPX_CLIENT) private readonly skydropx: SkydropxClient,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    @InjectRepository(OrderItemEntity)
    private readonly itemRepo: Repository<OrderItemEntity>,
    @InjectRepository(ProductDimensionEntity)
    private readonly dimensionRepo: Repository<ProductDimensionEntity>,
    @InjectRepository(PolarCheckoutEntity)
    private readonly checkoutRepo: Repository<PolarCheckoutEntity>,
  ) {}

  private assertEnabled(): void {
    if (!this.config.get('skydropx.enabled', { infer: true })) {
      throw new ServiceUnavailableException(
        'Skydropx shipping is not enabled (SKYDROPX_ENABLED=false)',
      );
    }
  }

  private buildOrigin(): SkydropxAddress {
    const o = this.config.get('skydropx.origin', { infer: true });
    return {
      name: o.name,
      company: o.company,
      street1: o.street1,
      postalCode: o.postalCode,
      areaLevel1: o.areaLevel1,
      areaLevel2: o.areaLevel2,
      areaLevel3: o.areaLevel3,
      countryCode: o.countryCode,
      phone: o.phone,
      email: o.email,
    };
  }

  /**
   * Builds the parcel from what the order actually contains.
   *
   * Two queries rather than a join through the relation: `product_dimension`
   * hangs off `pim.product`, and pulling it via `items -> product -> dimensions`
   * loads the whole product row for every line to read four numbers.
   */
  private async buildParcel(orderId: string): Promise<SkydropxParcel> {
    const items = await this.itemRepo.find({ where: { orderId } });
    const dimensions = items.length
      ? await this.dimensionRepo.find({
          where: { productId: In(items.map((i) => i.productId)) },
        })
      : [];
    const byProduct = new Map(dimensions.map((d) => [d.productId, d]));

    const lines: ParcelLine[] = items.map((item) => {
      const d = byProduct.get(item.productId);
      return {
        productId: item.productId,
        qty: item.qty,
        sku: item.skuSnapshot,
        weight: d?.weight,
        length: d?.length,
        width: d?.width,
        height: d?.height,
      };
    });

    const result = parcelFromLines(lines);
    if (!result.ok) throw new ParcelNotComputableError(result.skus);
    return result.parcel;
  }

  /**
   * Whether the order's freight may still change.
   *
   * A live Polar checkout was opened with the OLD `grand_total`, and Polar
   * charges the amount the checkout carries — not the one the order carries
   * when the customer finally clicks pay. Re-pricing under an open checkout is
   * therefore how a customer ends up charged an amount that matches nothing in
   * the database.
   */
  private async assertRepriceable(order: OrderEntity): Promise<void> {
    if (order.paymentStatus === 'paid') {
      throw new ConflictException(
        'Order is already paid; its shipping can no longer be re-priced.',
      );
    }
    const open = await this.checkoutRepo.findOne({
      where: {
        orderId: order.id,
        status: Not(In([...TERMINAL_CHECKOUT_STATUSES])),
      },
    });
    if (open) {
      throw new ConflictException(
        'An open Polar checkout exists for this order. Cancel or let it expire before changing the shipping rate.',
      );
    }
  }

  /**
   * Cotiza el envío de un pedido, con el bulto armado desde el catálogo.
   *
   * The `parcel` override is honoured for STAFF ONLY. `customer` holds
   * `shipping:read`, so before this gate any shopper could post
   * `parcel: {weight: 0.1}` and buy a rate for a box that does not exist. What a
   * customer's order weighs is not a customer's claim to make.
   */
  async quoteForOrder(
    orderId: string,
    user: AuthenticatedUser,
    override?: QuoteOverride,
  ): Promise<QuoteResult> {
    this.assertEnabled();

    // Quoting reads the order's full shipping address, so it is a read of
    // customer data and gets the same predicate every other order read uses.
    const order = await this.orderRepo.findOne({
      where: buildOrderWhere(user, orderId),
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    await this.assertRepriceable(order);

    const destination: SkydropxAddress = {
      name: override?.destination?.name ?? order.shipToName ?? undefined,
      company:
        override?.destination?.company ?? order.shipToCompany ?? undefined,
      street1:
        override?.destination?.street1 ?? order.shipToStreet1 ?? undefined,
      postalCode:
        override?.destination?.postalCode ??
        order.shipToPostalCode ??
        undefined,
      areaLevel1:
        override?.destination?.areaLevel1 ??
        order.shipToAreaLevel1 ??
        undefined,
      areaLevel2:
        override?.destination?.areaLevel2 ??
        order.shipToAreaLevel2 ??
        undefined,
      areaLevel3:
        override?.destination?.areaLevel3 ??
        order.shipToAreaLevel3 ??
        undefined,
      countryCode:
        override?.destination?.countryCode ?? order.shipToCountryCode ?? 'MX',
      phone: override?.destination?.phone ?? order.shipToPhone ?? undefined,
      email: override?.destination?.email ?? order.shipToEmail ?? undefined,
    };

    if (!destination.street1 || !destination.postalCode) {
      throw new BadRequestException(
        'Order is missing destination address (street1/postalCode). Provide it on the order or in the request body.',
      );
    }

    const isStaff = tierOf(user) !== 'customer';
    const parcel = await this.resolveParcel(
      order,
      isStaff ? override : undefined,
    );

    const quote = await this.skydropx.quote({
      origin: this.buildOrigin(),
      destination,
      parcel,
    });

    const priced = quote.rates.filter(
      (r) => typeof r.amount === 'number' && r.amount > 0,
    );

    // Zero rates is an ANSWER, not an outage: nobody covers this parcel to this
    // destination. A third of this catalogue exceeds ordinary parcel limits, so
    // it is a reachable outcome, and dressing it as a failure would offer a
    // "retry" that can only fail again.
    if (priced.length === 0) throw new NoShippingCoverageError();

    // Persisted so `selectRate` can resolve a rate id without re-quoting: a
    // second call returns different ids, and possibly a different price.
    order.shippingQuotationId = quote.quotationId;
    order.shippingRatesJson = priced;
    order.parcelWeight = parcel.weight;
    order.parcelLength = parcel.length;
    order.parcelWidth = parcel.width;
    order.parcelHeight = parcel.height;
    await this.orderRepo.save(order);

    return { quotationId: quote.quotationId, rates: priced };
  }

  /**
   * Staff may describe the box themselves; for everyone else the server builds it.
   *
   * A COMPLETE override skips the catalogue entirely — that is the escape hatch
   * for the case where dimensions are missing and someone measured the box by
   * hand, so it must not depend on the very lookup that failed. A PARTIAL one
   * ("this ships heavier than the catalogue says") lands on top of the computed
   * parcel, which is what the override meant before the server did the sizing.
   */
  private async resolveParcel(
    order: OrderEntity,
    override: QuoteOverride | undefined,
  ): Promise<SkydropxParcel> {
    const o = override?.parcel;
    if (o?.weight && o.length && o.width && o.height) {
      return {
        weight: o.weight,
        length: o.length,
        width: o.width,
        height: o.height,
      };
    }

    const base = await this.buildParcel(order.id);
    if (!o) return base;
    return {
      weight: o.weight ?? base.weight,
      length: o.length ?? base.length,
      width: o.width ?? base.width,
      height: o.height ?? base.height,
    };
  }

  /**
   * Accepts one of the quoted rates and prices it into the order.
   *
   * The client sends a `rateId` — a CHOICE — and never an amount. The price
   * written to `shipping_total` is the one Skydropx returned in the quote that
   * produced that id, read back from `shipping_rates_json`. That is the whole
   * point: a browser cannot name its own freight.
   */
  async selectRate(
    orderId: string,
    rateId: string,
    user: AuthenticatedUser,
  ): Promise<OrderEntity> {
    const order = await this.orderRepo.findOne({
      where: buildOrderWhere(user, orderId),
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    await this.assertRepriceable(order);

    const offered = (order.shippingRatesJson ?? []) as SkydropxRate[];
    const rate = offered.find((r) => r.rateId === rateId);
    if (!rate) {
      throw new ConflictException(
        'That rate was not among the ones quoted for this order. Quote again and choose from the new rates.',
      );
    }

    order.shippingRateId = rate.rateId;
    order.shippingCarrierName = rate.carrierName;
    order.shippingServiceLevel = rate.serviceLevel ?? null;
    order.shippingTotal = round2(rate.amount);
    order.shippingQuotedAt = new Date();
    order.grandTotal = orderGrandTotal({
      subtotal: order.subtotal,
      taxTotal: order.taxTotal,
      shippingTotal: order.shippingTotal,
      discountTotal: order.discountTotal,
    });

    return this.orderRepo.save(order);
  }
}
