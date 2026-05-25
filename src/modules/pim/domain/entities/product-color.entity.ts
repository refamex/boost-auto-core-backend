import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity({ schema: 'pim', name: 'product_color' })
export class ProductColorEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', name: 'id_product' })
  productId!: number;

  @ManyToOne(() => ProductEntity, (p) => p.colors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_product' })
  product!: ProductEntity;

  @Column({ type: 'text', nullable: true })
  name?: string | null;

  @Column({ type: 'text', nullable: true })
  code?: string | null;
}
