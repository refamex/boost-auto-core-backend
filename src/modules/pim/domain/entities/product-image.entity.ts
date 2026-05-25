import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity({ schema: 'pim', name: 'products_image' })
export class ProductImageEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'text', name: 'product_sku', nullable: true })
  productSku?: string | null;

  @ManyToOne(() => ProductEntity, (p) => p.images, { onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'product_sku', referencedColumnName: 'sku' })
  product?: ProductEntity;

  @Column({ type: 'text', nullable: true })
  url?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
