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
import { bigintTransformer } from '../../../../shared/database/bigint.transformer';
import { ProviderEntity } from '../../../suppliers/domain/entities/provider.entity';
import { AutoPartCatalogEntity } from './auto-part-catalog.entity';
import { BrandEntity } from './brand.entity';
import { CategoryEntity } from './category.entity';
import { ProductColorEntity } from './product-color.entity';
import { ProductDimensionEntity } from './product-dimension.entity';
import { ProductImageEntity } from './product-image.entity';

@Entity({ schema: 'pim', name: 'product' })
export class ProductEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', unique: true })
  sku!: string;

  @Column({ type: 'text', nullable: true })
  name?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({
    type: 'bigint',
    name: 'category_id',
    nullable: true,
    transformer: bigintTransformer,
  })
  categoryId?: number | null;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column({
    type: 'bigint',
    name: 'brand_id',
    nullable: true,
    transformer: bigintTransformer,
  })
  brandId?: number | null;

  @ManyToOne(() => BrandEntity, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand?: BrandEntity;

  @Column({
    type: 'bigint',
    name: 'provider_id',
    nullable: true,
    transformer: bigintTransformer,
  })
  providerId?: number | null;

  @ManyToOne(() => ProviderEntity)
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @Column({
    type: 'bigint',
    name: 'auto_part_type_id',
    nullable: true,
    transformer: bigintTransformer,
  })
  autoPartTypeId?: number | null;

  @ManyToOne(() => AutoPartCatalogEntity)
  @JoinColumn({ name: 'auto_part_type_id' })
  autoPartType?: AutoPartCatalogEntity;

  @Column({ type: 'text', name: 'provider_sku', nullable: true })
  providerSku?: string | null;

  @Column({ type: 'text', name: 'classification_by_rotation', nullable: true })
  classificationByRotation?: string | null;

  @Column({
    type: 'bigint',
    name: 'warranty_period',
    nullable: true,
    transformer: bigintTransformer,
  })
  warrantyPeriod?: number | null;

  @Column({ type: 'boolean', name: 'is_visible', default: true })
  isVisible!: boolean;

  @Column({ type: 'text', name: 'principal_image', nullable: true })
  principalImage?: string | null;

  @Column({ type: 'double precision', nullable: true })
  price?: number | null;

  /**
   * Disponibilidad, poblada por `ProductAvailabilityService`. NO son columnas:
   * el stock vive en `inventory.inventory` y se agrega al leer.
   *
   * Booleanos, nunca una cantidad. El comprador necesita saber si puede
   * comprar; cuánto hay es información interna, y publicarla entregaría el
   * inventario de la empresa a cualquiera que lea la API.
   */
  inStock?: boolean;
  lowStock?: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  // Pasiva: actualizada por trigger utils.set_updated_at en DB
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => ProductColorEntity, (c) => c.product)
  colors?: ProductColorEntity[];

  @OneToMany(() => ProductImageEntity, (i) => i.product)
  images?: ProductImageEntity[];

  @OneToMany(() => ProductDimensionEntity, (d) => d.product)
  dimensions?: ProductDimensionEntity[];
}
