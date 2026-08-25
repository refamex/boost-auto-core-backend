import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProductEntity } from './product.entity';

@Entity({ schema: 'pim', name: 'products_image' })
export class ProductImageEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'integer', name: 'product_id', nullable: true })
  productId?: number | null;

  @ManyToOne(() => ProductEntity, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ type: 'text', nullable: true })
  url?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
