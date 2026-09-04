import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { PriceListItemEntity } from '../../../commerce/domain/entities/price-list-item.entity';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import { QuoteEntity } from './quote.entity';

@Entity({ schema: 'quotes', name: 'quote_items' })
export class QuoteItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'quote_id' })
  quoteId!: string;

  @ManyToOne(() => QuoteEntity, (q) => q.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'quote_id' })
  quote?: QuoteEntity;

  @Column({ type: 'integer', name: 'product_id' })
  productId!: number;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  /**
   * Which price list row the unit price came from. Nullable and SET NULL on
   * delete: price list items cascade away with their list, and losing that
   * provenance must never take an issued quote with it.
   */
  @Column({ type: 'uuid', name: 'price_list_item_id', nullable: true })
  priceListItemId?: string | null;

  @ManyToOne(() => PriceListItemEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'price_list_item_id' })
  priceListItem?: PriceListItemEntity;

  /**
   * Snapshots freeze the catalog and the price at the moment the line was
   * priced, so editing a price list later cannot rewrite an issued quote.
   */
  @Column({ type: 'text', name: 'sku_snapshot' })
  skuSnapshot!: string;

  @Column({ type: 'text', name: 'name_snapshot' })
  nameSnapshot!: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  qty!: number;

  /**
   * What the price list said, frozen at creation. Kept alongside the effective
   * price so a discount stays auditable: without it, a line at 900 cannot be
   * told apart from a 1000 list price with 10% off.
   */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'list_price_snapshot',
    nullable: true,
    transformer: numericTransformer,
  })
  listPriceSnapshot?: number | null;

  /** Percentage taken off the list price. 0 means the list price was honoured. */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    name: 'discount_pct',
    default: 0,
    transformer: numericTransformer,
  })
  discountPct!: number;

  /** The EFFECTIVE price charged, after any manual price or discount. */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'unit_price_snapshot',
    transformer: numericTransformer,
  })
  unitPriceSnapshot!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'tax_snapshot',
    default: 0,
    transformer: numericTransformer,
  })
  taxSnapshot!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'line_total',
    transformer: numericTransformer,
  })
  lineTotal!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
