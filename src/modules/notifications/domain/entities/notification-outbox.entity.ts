import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { NotificationEntity } from './notification.entity';

export const OUTBOX_STATUSES = [
  'pending',
  'sent',
  'failed',
  'skipped',
] as const;
export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

/**
 * One delivery attempt track per (notification, channel).
 *
 * This is deliberately richer than the existing `webhook_events` tables. Those
 * insert a uniquely-keyed row *before* processing and stamp `processed_at`
 * after, with no reaper — so a handler that throws leaves the row unprocessed
 * while the unique constraint blocks the provider's retry, and the event is
 * lost for good. Recording attempts, the last error, and when to try again is
 * what makes this table recoverable instead of merely deduplicated.
 */
@Entity({ schema: 'notifications', name: 'outbox' })
@Unique(['notificationId', 'channel'])
@Index(['status', 'nextAttemptAt'])
export class NotificationOutboxEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'notification_id' })
  notificationId!: string;

  @ManyToOne(() => NotificationEntity, (n) => n.deliveries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'notification_id' })
  notification?: NotificationEntity;

  @Column({ type: 'varchar', length: 20 })
  channel!: string;

  /**
   * The address resolved at fan-out time and frozen. If the customer later
   * changes their email, the record still shows where this one actually went.
   */
  @Column({ type: 'text', nullable: true })
  destination?: string | null;

  @Column({ type: 'varchar', length: 20 })
  status!: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError?: string | null;

  @Column({ type: 'timestamptz', name: 'next_attempt_at' })
  nextAttemptAt!: Date;

  @Column({ type: 'timestamptz', name: 'sent_at', nullable: true })
  sentAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
