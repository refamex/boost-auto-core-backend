import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InventoryEntity } from '../../../inventory/domain/entities/inventory.entity';
import { AppConfig } from '../../../../shared/config/configuration';
import { ProductEntity } from '../../domain/entities/product.entity';

/**
 * Attaches availability to catalogue products, as two booleans.
 *
 * WHY BOOLEANS AND NEVER A COUNT. The storefront needs to stop a shopper
 * checking out with something that is gone — finding 21. It does not need to
 * know how much of it there is, and publishing that would hand the company's
 * inventory to anyone who reads the API. `GET /v1/inventory` stays behind
 * `inventory:read`, where it belongs; this is the sliver a buyer legitimately
 * needs.
 *
 * The alternative was granting `inventory:read` to the `customer` role. That
 * would have closed the finding by opening something worse.
 *
 * ONE QUERY FOR THE WHOLE PAGE, not one per product: a fifty-item catalogue
 * page would otherwise fire fifty round trips to answer a yes/no.
 */
@Injectable()
export class ProductAvailabilityService {
  constructor(
    @InjectRepository(InventoryEntity)
    private readonly inventory: Repository<InventoryEntity>,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async decorate<T extends ProductEntity>(products: T[]): Promise<T[]> {
    if (products.length === 0) return products;

    const threshold = this.config.get('inventory.lowStockThreshold', {
      infer: true,
    });

    const rows = await this.inventory
      .createQueryBuilder('i')
      .select('i.product_id', 'productId')
      .addSelect(
        'COALESCE(SUM(i.stock), 0) - COALESCE(SUM(i.reserved_stock), 0)',
        'available',
      )
      .where({ productId: In(products.map((p) => p.id)) })
      .groupBy('i.product_id')
      .getRawMany<{ productId: string; available: string }>();

    const availableById = new Map(
      rows.map((r) => [Number(r.productId), Number(r.available)]),
    );

    for (const product of products) {
      // A product nobody ever stocked has no rows at all. Absent means zero,
      // not "unknown" — and certainly not "hide it from the catalogue", which
      // is what an INNER JOIN in the listing query would have done.
      const available = availableById.get(product.id) ?? 0;
      product.inStock = available > 0;
      // Strictly inside the threshold: at zero the product is out of stock, and
      // "last units" on something you cannot buy would be a lie.
      product.lowStock = available > 0 && available <= threshold;
    }

    return products;
  }
}
