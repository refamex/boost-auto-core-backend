import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CategoryDepartmentEntity } from './category-department.entity';

@Entity({ schema: 'pim', name: 'category' })
export class CategoryEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', unique: true })
  code!: string;

  @Column({ type: 'integer', name: 'id_department' })
  idDepartment!: number;

  @ManyToOne(() => CategoryDepartmentEntity, (d) => d.categories, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_department' })
  department!: CategoryDepartmentEntity;

  @Column({ type: 'text', nullable: true })
  image?: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
