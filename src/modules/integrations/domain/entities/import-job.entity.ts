import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ImportJobLogEntity } from './import-job-log.entity';

@Entity({ schema: 'integrations', name: 'import_jobs' })
export class ImportJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, name: 'job_type' })
  jobType!: string;

  @Column({
    type: 'varchar',
    length: 150,
    name: 'source_system',
    nullable: true,
  })
  sourceSystem?: string | null;

  @Column({ type: 'varchar', length: 50 })
  status!: string;

  @Column({ type: 'timestamp', name: 'started_at', nullable: true })
  startedAt?: Date | null;

  @Column({ type: 'timestamp', name: 'finished_at', nullable: true })
  finishedAt?: Date | null;

  @Column({ type: 'int', name: 'records_received', default: 0 })
  recordsReceived!: number;

  @Column({ type: 'int', name: 'records_processed', default: 0 })
  recordsProcessed!: number;

  @Column({ type: 'int', name: 'records_failed', default: 0 })
  recordsFailed!: number;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => ImportJobLogEntity, (l) => l.job)
  logs?: ImportJobLogEntity[];
}
