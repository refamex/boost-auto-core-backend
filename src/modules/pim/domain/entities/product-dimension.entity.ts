import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity({ schema: 'pim', name: 'product_dimension' })
export class ProductDimensionEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', name: 'product_sku', unique: true })
  productSku!: string;

  @ManyToOne(() => ProductEntity, (p) => p.dimensions, { onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'product_sku', referencedColumnName: 'sku' })
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
