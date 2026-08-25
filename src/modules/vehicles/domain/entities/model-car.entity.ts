import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AssemblyPlantEntity } from './assembly-plant.entity';

@Entity({ schema: 'vehicles', name: 'model_car' })
export class ModelCarEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'text', name: 'code_model', unique: true, nullable: true })
  codeModel?: string | null;

  @Column({ type: 'text', name: 'model_car', nullable: true })
  modelCar?: string | null;

  @Column({ type: 'bigint', name: 'assembly_plant_id', nullable: true })
  assemblyPlantId?: string | null;

  @ManyToOne(() => AssemblyPlantEntity)
  @JoinColumn({ name: 'assembly_plant_id' })
  assemblyPlant?: AssemblyPlantEntity;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
