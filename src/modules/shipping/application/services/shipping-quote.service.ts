import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppConfig } from '../../../../shared/config/configuration';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';
import { buildOrderWhere } from '../../domain/shipping-visibility';
import {
  QuoteResult,
  SKYDROPX_CLIENT,
  SkydropxAddress,
  SkydropxClient,
  SkydropxParcel,
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
   * Cotiza el envío de un pedido. Toma destino/parcel del propio pedido,
   * permitiendo override puntual en el request (ej. recotizar con otro bulto).
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

    const parcel: SkydropxParcel = {
      weight: override?.parcel?.weight ?? order.parcelWeight ?? 0,
      length: override?.parcel?.length ?? order.parcelLength ?? 0,
      width: override?.parcel?.width ?? order.parcelWidth ?? 0,
      height: override?.parcel?.height ?? order.parcelHeight ?? 0,
    };

    if (
      parcel.weight <= 0 ||
      parcel.length <= 0 ||
      parcel.width <= 0 ||
      parcel.height <= 0
    ) {
      throw new BadRequestException(
        'Parcel weight and dimensions must be greater than zero. Provide them on the order or in the request body.',
      );
    }

    return this.skydropx.quote({
      origin: this.buildOrigin(),
      destination,
      parcel,
    });
  }
}
