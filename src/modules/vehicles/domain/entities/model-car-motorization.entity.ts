import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { ModelCarEntity } from './model-car.entity';
import { MotorizationCarEntity } from './motorization-car.entity';

@Entity({ schema: 'vehicles', name: 'model_car_motorization' })
@Unique(['modelCarId', 'motorizationId'])
export class ModelCarMotorizationEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'bigint', name: 'model_car_id', nullable: true })
  modelCarId?: string | null;

  @ManyToOne(() => ModelCarEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'model_car_id' })
  modelCar?: ModelCarEntity;

  @Column({ type: 'bigint', name: 'motorization_id', nullable: true })
  motorizationId?: string | null;

  @ManyToOne(() => MotorizationCarEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'motorization_id' })
  motorization?: MotorizationCarEntity;
}
