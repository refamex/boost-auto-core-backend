import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity({ schema: 'pim', name: 'product_dimension' })
export class ProductDimensionEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', name: 'product_id', unique: true })
  productId!: number;

  @ManyToOne(() => ProductEntity, (p) => p.dimensions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'double precision', nullable: true })
  length?: number | null;

  @Column({ type: 'double precision' })
  width!: number;

  @Column({ type: 'double precision', nullable: true })
  height?: number | null;

  @Column({ type: 'double precision', nullable: true })
  weight?: number | null;
}
