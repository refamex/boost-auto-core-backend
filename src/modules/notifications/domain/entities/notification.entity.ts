import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import {
  NotificationCategory,
  NotificationEventKey,
} from '../notification-event';
import { NotificationOutboxEntity } from './notification-outbox.entity';

@Entity({ schema: 'notifications', name: 'notifications' })
@Index(['recipientUserId', 'readAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * The JWT `sub` of whoever this is for — the same value orders stores as
   * customer_id. Bare UUID with no FK: identity lives in the auth service, in a
   * different database.
   */
  @Column({ type: 'uuid', name: 'recipient_user_id' })
  recipientUserId!: string;

  @Column({ type: 'varchar', length: 50 })
  category!: NotificationCategory;

  @Column({ type: 'varchar', length: 80, name: 'event_key' })
  eventKey!: NotificationEventKey;

  @Column({ type: 'text' })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body?: string | null;

  /** Where the row points. Nullable so a notification with no destination is representable. */
  @Column({ type: 'text', nullable: true })
  link?: string | null;

  @Column({ type: 'varchar', length: 50, name: 'entity_type' })
  entityType!: string;

  @Column({ type: 'uuid', name: 'entity_id' })
  entityId!: string;

  /** `${eventKey}:${entityId}:${recipientUserId}` — makes creation idempotent
   * under webhook redelivery. Unique. */
  @Column({ type: 'varchar', length: 200, name: 'dedupe_key', unique: true })
  dedupeKey!: string;

  /** Null means unread. A timestamp rather than a boolean so "when did they see
   * it" is answerable without a second column. */
  @Column({ type: 'timestamptz', name: 'read_at', nullable: true })
  readAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => NotificationOutboxEntity, (o) => o.notification)
  deliveries?: NotificationOutboxEntity[];
}
