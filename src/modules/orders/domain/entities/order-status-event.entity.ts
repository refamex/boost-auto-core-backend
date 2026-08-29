import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { OrderEntity } from './order.entity';

/**
 * One recorded state transition of an order.
 *
 * WHY A TABLE AND NOT TWO COLUMNS: a `last_status_by` pair answers "who did the
 * most recent thing", and the question that actually gets asked is "who
 * cancelled this order last Tuesday". Each transition overwrites the previous
 * answer, so the one worth auditing is always the one already gone.
 *
 * Modelled on `shipping.shipment_tracking_events`, which solves the same shape
 * for carrier updates.
 */
@Entity({ schema: 'orders', name: 'order_status_events' })
export class OrderStatusEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_order_status_events_order')
  @Column({ type: 'uuid', name: 'order_id' })
  orderId!: string;

  @ManyToOne(() => OrderEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  /** `null` on creation — an order comes from nowhere. */
  @Column({ type: 'varchar', length: 40, name: 'from_status', nullable: true })
  fromStatus?: string | null;

  @Column({ type: 'varchar', length: 40, name: 'to_status' })
  toStatus!: string;

  /**
   * NULLABLE ON PURPOSE: not every transition is performed by a person. The
   * Polar webhook confirms orders with no user context at all, and a NOT NULL
   * here would force inventing an actor for it — worse than recording honestly
   * that the system did it.
   */
  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId?: string | null;

  /**
   * FROZEN, not resolved at read time. Looking the address up from `actor_id`
   * when the history is displayed means the record changes if that person later
   * changes their email — and then it stops being a record of what happened.
   */
  @Column({ type: 'varchar', length: 255, name: 'actor_email', nullable: true })
  actorEmail?: string | null;

  @Column({
    type: 'timestamptz',
    name: 'occurred_at',
    default: () => 'CURRENT_TIMESTAMP',
  })
  occurredAt!: Date;
}
