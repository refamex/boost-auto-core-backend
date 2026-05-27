import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImportJobEntity } from './import-job.entity';

@Entity({ schema: 'integrations', name: 'import_job_logs' })
export class ImportJobLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'job_id' })
  jobId!: string;

  @ManyToOne(() => ImportJobEntity, (j) => j.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job?: ImportJobEntity;

  @Column({ type: 'varchar', length: 20, nullable: true })
  level?: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', name: 'payload_json', nullable: true })
  payloadJson?: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
