import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../../shared/database/bigint.transformer';
import { ProductEntity } from '../../../pim/domain/entities/product.entity';
import { ProviderBranchEntity } from '../../../suppliers/domain/entities/provider-branch.entity';

@Entity({ schema: 'inventory', name: 'inventory' })
@Unique(['productSku', 'providerBranchId'])
@Index(['productSku', 'providerBranchId'])
export class InventoryEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', name: 'product_sku' })
  productSku!: string;

  @ManyToOne(() => ProductEntity, { onUpdate: 'CASCADE' })
  @JoinColumn({ name: 'product_sku', referencedColumnName: 'sku' })
  product?: ProductEntity;

  @Column({ type: 'text', name: 'provider_sku' })
  providerSku!: string;

  @Column({ type: 'bigint', name: 'provider_branch_id', transformer: bigintTransformer })
  providerBranchId!: number;

  @ManyToOne(() => ProviderBranchEntity)
  @JoinColumn({ name: 'provider_branch_id' })
  providerBranch?: ProviderBranchEntity;

  @Column({ type: 'integer', default: 0 })
  stock!: number;

  @Column({ type: 'integer', name: 'reserved_stock', default: 0 })
  reservedStock!: number;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
