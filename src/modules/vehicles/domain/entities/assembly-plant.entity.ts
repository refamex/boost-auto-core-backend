import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'vehicles', name: 'assembly_plant' })
export class AssemblyPlantEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'text', unique: true, nullable: true })
  code?: string | null;

  @Column({ type: 'text', name: 'assembly_plant', nullable: true })
  assemblyPlant?: string | null;
}
