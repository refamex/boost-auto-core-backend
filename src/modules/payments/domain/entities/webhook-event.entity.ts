import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'payments', name: 'webhook_events' })
export class WebhookEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', name: 'polar_event_id', unique: true })
  polarEventId!: string;

  @Column({ type: 'varchar', length: 100, name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb', name: 'payload_json' })
  payloadJson!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'processed_at', nullable: true })
  processedAt?: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
