import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { BrandEntity } from './brand.entity';
import { CategoryEntity } from './category.entity';

@Entity({ schema: 'pim', name: 'brand_category' })
@Unique(['brandId', 'categoryId'])
export class BrandCategoryEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'integer', name: 'brand_id', nullable: true })
  brandId?: number | null;

  @ManyToOne(() => BrandEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand?: BrandEntity;

  @Column({ type: 'integer', name: 'category_id', nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => CategoryEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
