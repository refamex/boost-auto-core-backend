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
import { AssemblyPlantEntity } from '../../../vehicles/domain/entities/assembly-plant.entity';
import { ModelCarEntity } from '../../../vehicles/domain/entities/model-car.entity';
import { MotorizationCarEntity } from '../../../vehicles/domain/entities/motorization-car.entity';
import { YearCarEntity } from '../../../vehicles/domain/entities/year-car.entity';

@Entity({ schema: 'compatibility', name: 'compatibilities' })
@Unique(['productId', 'assemblyPlantId', 'modelId', 'yearId', 'motorizationId'])
export class CompatibilityEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'integer', name: 'product_id' })
  productId!: number;
  @ManyToOne(() => ProductEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ type: 'bigint', name: 'assembly_plant_id' })
  assemblyPlantId!: string;
  @ManyToOne(() => AssemblyPlantEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'assembly_plant_id' })
  assemblyPlant?: AssemblyPlantEntity;

  @Column({ type: 'bigint', name: 'model_id' })
  modelId!: string;
  @ManyToOne(() => ModelCarEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'model_id' })
  model?: ModelCarEntity;

  @Column({ type: 'integer', name: 'year_id' })
  yearId!: number;
  @ManyToOne(() => YearCarEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'year_id' })
  year?: YearCarEntity;

  @Column({ type: 'bigint', name: 'motorization_id' })
  motorizationId!: string;
  @ManyToOne(() => MotorizationCarEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'motorization_id' })
  motorization?: MotorizationCarEntity;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
