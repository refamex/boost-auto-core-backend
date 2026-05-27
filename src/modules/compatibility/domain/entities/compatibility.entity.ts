import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';

@Entity({ schema: 'compatibility', name: 'compatibilities' })
@Unique(['sku', 'assemblyPlantCode', 'modelCode', 'yearCode', 'motorizationCode'])
export class CompatibilityEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'text' })
  sku!: string;

  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'sku', referencedColumnName: 'sku' })
  product?: ProductEntity;

  @Column({ type: 'text', name: 'assembly_plant_code' })
  assemblyPlantCode!: string;

  @Column({ type: 'text', name: 'model_code' })
  modelCode!: string;

  @Column({ type: 'text', name: 'year_code' })
  yearCode!: string;

  @Column({ type: 'text', name: 'motorization_code' })
  motorizationCode!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
