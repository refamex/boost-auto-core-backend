import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import { PriceListEntity } from './price-list.entity';

@Entity({ schema: 'commerce', name: 'price_list_items' })
@Unique(['priceListId', 'productId', 'minQty', 'validFrom'])
export class PriceListItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'price_list_id' })
  priceListId!: string;

  @ManyToOne(() => PriceListEntity, (p) => p.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'price_list_id' })
  priceList?: PriceListEntity;

  @Column({ type: 'integer', name: 'product_id' })
  productId!: number;

  @ManyToOne(() => ProductEntity)
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  price!: number;

  @Column({ type: 'int', name: 'min_qty', default: 1 })
  minQty!: number;

  @Column({ type: 'date', name: 'valid_from', nullable: true })
  validFrom?: string | null;

  @Column({ type: 'date', name: 'valid_to', nullable: true })
  validTo?: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
