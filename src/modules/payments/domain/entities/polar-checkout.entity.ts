import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { OrderEntity } from '../../../orders/domain/entities/order.entity';

@Entity({ schema: 'payments', name: 'polar_checkouts' })
export class PolarCheckoutEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Column({ type: 'text', name: 'polar_checkout_id', unique: true })
  polarCheckoutId!: string;

  @Column({ type: 'text', name: 'polar_order_id', nullable: true })
  polarOrderId?: string | null;

  @Column({ type: 'varchar', length: 50 })
  status!: string;

  @Column({ type: 'text', name: 'checkout_url' })
  checkoutUrl!: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  currency!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
