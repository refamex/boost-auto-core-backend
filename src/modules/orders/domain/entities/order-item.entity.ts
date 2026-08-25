import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import { OrderEntity } from './order.entity';

@Entity({ schema: 'orders', name: 'order_items' })
export class OrderItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Column({ type: 'integer', name: 'product_id' })
  productId!: number;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

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

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
