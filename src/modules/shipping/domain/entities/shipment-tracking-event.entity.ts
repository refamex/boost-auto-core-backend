import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ShipmentEntity } from './shipment.entity';

@Entity({ schema: 'shipping', name: 'shipment_tracking_events' })
export class ShipmentTrackingEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'shipment_id' })
  shipmentId!: string;

  @ManyToOne('ShipmentEntity', 'trackingEvents')
  @JoinColumn({ name: 'shipment_id' })
  shipment?: ShipmentEntity;

  @Column({ type: 'varchar', length: 80 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'timestamptz', name: 'occurred_at', nullable: true })
  occurredAt?: Date | null;

  @Column({ type: 'jsonb', name: 'raw_json', nullable: true })
  rawJson?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
