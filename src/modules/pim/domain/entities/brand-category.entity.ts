import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'pim', name: 'brand_category' })
@Unique(['brandCode', 'categoryCode'])
export class BrandCategoryEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', name: 'brand_code', nullable: true })
  brandCode?: string | null;

  @Column({ type: 'text', name: 'category_code', nullable: true })
  categoryCode?: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
