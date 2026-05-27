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
import { OrderEntity } from '../../../orders/domain/entities/order.entity';

@Entity({ schema: 'shipping', name: 'shipments' })
export class ShipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Column({ type: 'text', name: 'skydropx_shipment_id', unique: true })
  skydropxShipmentId!: string;

  @Column({ type: 'text', name: 'quotation_id', nullable: true })
  quotationId?: string | null;

  @Column({ type: 'text', name: 'rate_id', nullable: true })
  rateId?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'carrier_name', nullable: true })
  carrierName?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'service_level', nullable: true })
  serviceLevel?: string | null;

  @Column({ type: 'text', name: 'tracking_number', nullable: true })
  trackingNumber?: string | null;

  @Column({ type: 'text', name: 'tracking_url', nullable: true })
  trackingUrl?: string | null;

  @Column({ type: 'text', name: 'label_url', nullable: true })
  labelUrl?: string | null;

  @Column({ type: 'varchar', length: 50 })
  status!: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  amount?: number | null;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  currency!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('ShipmentTrackingEventEntity', 'shipment')
  trackingEvents?: import('./shipment-tracking-event.entity').ShipmentTrackingEventEntity[];
}
