import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { InvoiceEntity } from './invoice.entity';

@Entity({ schema: 'billing', name: 'invoice_documents' })
export class InvoiceDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'invoice_id' })
  invoiceId!: string;

  @ManyToOne(() => InvoiceEntity, (i) => i.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice?: InvoiceEntity;

  @Column({ type: 'varchar', length: 20, name: 'document_type' })
  documentType!: string;

  @Column({ type: 'text', name: 'file_url' })
  fileUrl!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  checksum?: string | null;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;
}
