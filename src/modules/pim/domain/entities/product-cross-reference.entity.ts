import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BrandEntity } from './brand.entity';
import { ProductEntity } from './product.entity';

@Entity({ schema: 'pim', name: 'product_cross_references' })
export class ProductCrossReferenceEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'integer', name: 'product_id' })
  productId!: number;
  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: ProductEntity;

  @Column({ type: 'integer', name: 'product_brand_id', nullable: true })
  productBrandId?: number | null;
  @ManyToOne(() => BrandEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_brand_id' })
  productBrandRef?: BrandEntity;

  @Column({ type: 'integer', name: 'reference_id', nullable: true })
  referenceId?: number | null;
  @ManyToOne(() => ProductEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reference_id' })
  reference?: ProductEntity;

  @Column({ type: 'integer', name: 'reference_brand_id', nullable: true })
  referenceBrandId?: number | null;
  @ManyToOne(() => BrandEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reference_brand_id' })
  referenceBrandRef?: BrandEntity;

  @Column({ type: 'integer', name: 'reference_product_id', nullable: true })
  referenceProductId?: number | null;
  @ManyToOne(() => ProductEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reference_product_id' })
  referenceProduct?: ProductEntity;

  @Column({ type: 'text', name: 'provider_sku', nullable: true })
  providerSku?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
