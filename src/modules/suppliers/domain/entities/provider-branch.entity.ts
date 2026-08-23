import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../../shared/database/bigint.transformer';
import { ProviderEntity } from './provider.entity';

@Entity({ schema: 'suppliers', name: 'provider_branch' })
export class ProviderBranchEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({
    type: 'bigint',
    name: 'provider_id',
    transformer: bigintTransformer,
  })
  providerId!: number;

  @ManyToOne(() => ProviderEntity, (p) => p.branches)
  @JoinColumn({ name: 'provider_id' })
  provider!: ProviderEntity;

  @Column({ type: 'varchar', name: 'branch_name' })
  branchName!: string;

  @Column({ type: 'varchar', name: 'contact_person', nullable: true })
  contactPerson?: string | null;

  @Column({ type: 'varchar' })
  phone!: string;

  @Column({ type: 'varchar', nullable: true })
  email?: string | null;

  @Column({ type: 'text' })
  address!: string;

  @Column({ type: 'varchar' })
  city!: string;

  @Column({ type: 'varchar', name: 'postal_code' })
  postalCode!: string;

  @Column({ type: 'boolean', name: 'is_main_branch', default: false })
  isMainBranch!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
