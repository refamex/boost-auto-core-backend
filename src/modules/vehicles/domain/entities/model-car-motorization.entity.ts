import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'vehicles', name: 'model_car_motorization' })
@Unique(['modelCarCode', 'motorizationCode'])
export class ModelCarMotorizationEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', name: 'model_car_code', nullable: true })
  modelCarCode?: string | null;

  @Column({ type: 'text', name: 'motorization_code', nullable: true })
  motorizationCode?: string | null;
}
