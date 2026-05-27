import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { PaymentMethodEntity } from '../../../commerce/domain/entities/payment-method.entity';
import { OrderEntity } from './order.entity';

@Entity({ schema: 'orders', name: 'order_payments' })
export class OrderPaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, (o) => o.payments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Column({ type: 'uuid', name: 'payment_method_id', nullable: true })
  paymentMethodId?: string | null;

  @ManyToOne(() => PaymentMethodEntity)
  @JoinColumn({ name: 'payment_method_id' })
  paymentMethod?: PaymentMethodEntity;

  @Column({ type: 'varchar', length: 150, nullable: true })
  provider?: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: numericTransformer })
  amount!: number;

  @Column({ type: 'varchar', length: 50 })
  status!: string;

  @Column({ type: 'varchar', length: 255, name: 'transaction_ref', nullable: true })
  transactionRef?: string | null;

  @Column({ type: 'timestamp', name: 'paid_at', nullable: true })
  paidAt?: Date | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
