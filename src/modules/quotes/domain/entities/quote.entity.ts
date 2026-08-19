import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { PriceListEntity } from '../../../commerce/domain/entities/price-list.entity';
import { QuoteStatus } from '../quote-status';
import { QuoteItemEntity } from './quote-item.entity';

@Entity({ schema: 'quotes', name: 'quotes' })
export class QuoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, name: 'quote_number', unique: true })
  quoteNumber!: string;

  /**
   * Both actors live in autoboost-backend-auth (identity.customer_profiles,
   * identity.sales_reps), so these are bare UUIDs with no foreign key.
   */
  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', name: 'sales_rep_id', nullable: true })
  salesRepId?: string | null;

  /** The list the prices were resolved from, frozen at creation. */
  @Column({ type: 'uuid', name: 'price_list_id', nullable: true })
  priceListId?: string | null;

  @ManyToOne(() => PriceListEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'price_list_id' })
  priceList?: PriceListEntity;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  currency!: string;

  @Column({ type: 'varchar', length: 50 })
  status!: QuoteStatus;

  /** Mandatory and always in the future at creation; drives derived expiry. */
  @Column({ type: 'timestamptz', name: 'valid_until' })
  validUntil!: Date;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  subtotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'tax_total',
    default: 0,
    transformer: numericTransformer,
  })
  taxTotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'grand_total',
    default: 0,
    transformer: numericTransformer,
  })
  grandTotal!: number;

  /**
   * Set when the quote is converted. The column carries a real FK to
   * orders.orders, but no relation is mapped here: quotes reads orders through
   * OrderService, never by joining.
   */
  @Column({ type: 'uuid', name: 'converted_order_id', nullable: true })
  convertedOrderId?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => QuoteItemEntity, (i) => i.quote)
  items?: QuoteItemEntity[];
}
