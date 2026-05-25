import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CategoryEntity } from './category.entity';
import { VolumeCategoryEntity } from './volume-category.entity';

@Entity({ schema: 'pim', name: 'auto_part_catalog' })
export class AutoPartCatalogEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true, unique: true })
  code?: string | null;

  @Column({ type: 'integer', name: 'volume_category_id', nullable: true })
  volumeCategoryId?: number | null;

  @ManyToOne(() => VolumeCategoryEntity)
  @JoinColumn({ name: 'volume_category_id' })
  volumeCategory?: VolumeCategoryEntity;

  @Column({ type: 'integer', name: 'category_id', nullable: true })
  categoryId?: number | null;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_id' })
  category?: CategoryEntity;

  @Column({ type: 'boolean', name: 'is_activate', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
