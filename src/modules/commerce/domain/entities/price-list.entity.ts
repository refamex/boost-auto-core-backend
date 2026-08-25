import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PriceListItemEntity } from './price-list-item.entity';

@Entity({ schema: 'commerce', name: 'price_lists' })
export class PriceListEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'customer_type',
    nullable: true,
  })
  customerType?: string | null;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  currency!: string;

  @Column({ type: 'boolean', name: 'is_default', default: false })
  isDefault!: boolean;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => PriceListItemEntity, (i) => i.priceList)
  items?: PriceListItemEntity[];
}
