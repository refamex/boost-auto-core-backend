import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../../shared/database/bigint.transformer';
import { CategoryEntity } from './category.entity';

@Entity({ schema: 'pim', name: 'category_complement' })
export class CategoryComplementEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'integer', name: 'category_index_id', nullable: true, transformer: bigintTransformer })
  categoryIndexId?: number | null;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_index_id' })
  categoryIndex?: CategoryEntity;

  @Column({ type: 'integer', name: 'category_complement_id', nullable: true })
  categoryComplementId?: number | null;

  @ManyToOne(() => CategoryEntity)
  @JoinColumn({ name: 'category_complement_id' })
  categoryComplement?: CategoryEntity;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
