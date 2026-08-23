import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { bigintTransformer } from '../../../../shared/database/bigint.transformer';
import { BrandEntity } from '../../../pim/domain/entities/brand.entity';
import { ProviderEntity } from './provider.entity';

@Entity({ schema: 'suppliers', name: 'brand_provider' })
@Unique(['brandId', 'providerId'])
export class BrandProviderEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'integer', name: 'brand_id' })
  brandId!: number;

  @ManyToOne(() => BrandEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'brand_id' })
  brand!: BrandEntity;

  @Column({
    type: 'bigint',
    name: 'provider_id',
    transformer: bigintTransformer,
  })
  providerId!: number;

  @ManyToOne(() => ProviderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'provider_id' })
  provider!: ProviderEntity;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
