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

  @Column({ type: 'text', name: 'product_sku' })
  productSku!: string;

  @ManyToOne(() => ProductEntity, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_sku', referencedColumnName: 'sku' })
  product!: ProductEntity;

  @Column({ type: 'text', name: 'product_brand', nullable: true })
  productBrand?: string | null;

  @ManyToOne(() => BrandEntity, { onUpdate: 'CASCADE', onDelete: 'SET NULL' })
  @JoinColumn({ name: 'product_brand', referencedColumnName: 'brandCode' })
  productBrandRef?: BrandEntity;

  @Column({ type: 'text', name: 'reference_sku', nullable: true })
  referenceSku?: string | null;

  @Column({ type: 'text', name: 'reference_brand', nullable: true })
  referenceBrand?: string | null;

  @Column({ type: 'text', name: 'reference_product_sku', nullable: true })
  referenceProductSku?: string | null;

  @Column({ type: 'text', name: 'provider_sku', nullable: true })
  providerSku?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
