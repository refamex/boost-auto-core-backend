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

@Entity({ schema: 'sales', name: 'sales' })
export class SaleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, name: 'sale_number', unique: true })
  saleNumber!: string;

  @Column({ type: 'varchar', length: 50, name: 'source_type' })
  sourceType!: string;

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId?: string | null;

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', name: 'employee_id', nullable: true })
  employeeId?: string | null;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  subtotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'discount_total',
    default: 0,
    transformer: numericTransformer,
  })
  discountTotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'tax_total',
    default: 0,
    transformer: numericTransformer,
  })
  taxTotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'grand_total',
    default: 0,
    transformer: numericTransformer,
  })
  grandTotal!: number;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'payment_status',
    nullable: true,
  })
  paymentStatus?: string | null;

  @Column({ type: 'varchar', length: 50, name: 'sale_status', nullable: true })
  saleStatus?: string | null;

  @Column({ type: 'timestamp', name: 'sold_at', default: () => 'NOW()' })
  soldAt!: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;
}
