import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ schema: 'pim', name: 'volume_category' })
export class VolumeCategoryEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'double precision', nullable: true })
  weight?: number | null;

  @Column({ type: 'double precision', nullable: true })
  height?: number | null;

  @Column({ type: 'double precision', nullable: true })
  width?: number | null;

  @Column({ type: 'double precision', nullable: true })
  length?: number | null;

  @CreateDateColumn({ type: 'date', name: 'created_at' })
  createdAt!: Date;
}
