import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { numericTransformer } from '../../../../shared/database/numeric.transformer';
import { bigintTransformer } from '../../../../shared/database/bigint.transformer';
import { ProviderBranchEntity } from '../../../suppliers/domain/entities/provider-branch.entity';
import { OrderItemEntity } from './order-item.entity';
import { OrderPaymentEntity } from './order-payment.entity';

@Entity({ schema: 'orders', name: 'orders' })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, name: 'order_number', unique: true })
  orderNumber!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'uuid', name: 'sales_rep_id', nullable: true })
  salesRepId?: string | null;

  @Column({ type: 'bigint', name: 'provider_branch_id', nullable: true, transformer: bigintTransformer })
  providerBranchId?: number | null;

  @ManyToOne(() => ProviderBranchEntity)
  @JoinColumn({ name: 'provider_branch_id' })
  providerBranch?: ProviderBranchEntity;

  @Column({ type: 'varchar', length: 50 })
  status!: string;

  @Column({ type: 'varchar', length: 50, name: 'payment_status', default: 'pending' })
  paymentStatus!: string;

  @Column({ type: 'varchar', length: 50, name: 'shipping_status', default: 'pending' })
  shippingStatus!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'discount_total', default: 0, transformer: numericTransformer })
  discountTotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'shipping_total', default: 0, transformer: numericTransformer })
  shippingTotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'tax_total', default: 0, transformer: numericTransformer })
  taxTotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'grand_total', default: 0, transformer: numericTransformer })
  grandTotal!: number;

  // --- Datos de envío (destino). El origen es la bodega (config Skydropx). ---
  @Column({ type: 'varchar', length: 150, name: 'ship_to_name', nullable: true })
  shipToName?: string | null;

  @Column({ type: 'varchar', length: 150, name: 'ship_to_company', nullable: true })
  shipToCompany?: string | null;

  @Column({ type: 'varchar', length: 255, name: 'ship_to_street1', nullable: true })
  shipToStreet1?: string | null;

  @Column({ type: 'varchar', length: 20, name: 'ship_to_postal_code', nullable: true })
  shipToPostalCode?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'ship_to_area_level1', nullable: true })
  shipToAreaLevel1?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'ship_to_area_level2', nullable: true })
  shipToAreaLevel2?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'ship_to_area_level3', nullable: true })
  shipToAreaLevel3?: string | null;

  @Column({ type: 'varchar', length: 2, name: 'ship_to_country_code', nullable: true })
  shipToCountryCode?: string | null;

  @Column({ type: 'varchar', length: 40, name: 'ship_to_phone', nullable: true })
  shipToPhone?: string | null;

  @Column({ type: 'varchar', length: 150, name: 'ship_to_email', nullable: true })
  shipToEmail?: string | null;

  // --- Parcel (peso/dimensiones del bulto a enviar). ---
  @Column({ type: 'numeric', precision: 10, scale: 3, name: 'parcel_weight', nullable: true, transformer: numericTransformer })
  parcelWeight?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'parcel_length', nullable: true, transformer: numericTransformer })
  parcelLength?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'parcel_width', nullable: true, transformer: numericTransformer })
  parcelWidth?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'parcel_height', nullable: true, transformer: numericTransformer })
  parcelHeight?: number | null;

  @Column({ type: 'timestamp', name: 'placed_at', default: () => 'NOW()' })
  placedAt!: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => OrderItemEntity, (i) => i.order)
  items?: OrderItemEntity[];

  @OneToMany(() => OrderPaymentEntity, (p) => p.order)
  payments?: OrderPaymentEntity[];
}
