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
import { SaleEntity } from '../../../sales/domain/entities/sale.entity';
import { InvoiceDocumentEntity } from './invoice-document.entity';

@Entity({ schema: 'billing', name: 'invoices' })
export class InvoiceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 80, name: 'invoice_number', unique: true })
  invoiceNumber!: string;

  @Column({ type: 'uuid', name: 'order_id', nullable: true })
  orderId?: string | null;

  @ManyToOne(() => OrderEntity)
  @JoinColumn({ name: 'order_id' })
  order?: OrderEntity;

  @Column({ type: 'uuid', name: 'sale_id', nullable: true })
  saleId?: string | null;

  @ManyToOne(() => SaleEntity)
  @JoinColumn({ name: 'sale_id' })
  sale?: SaleEntity;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rfc?: string | null;

  @Column({ type: 'varchar', length: 255, name: 'legal_name', nullable: true })
  legalName?: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0, transformer: numericTransformer })
  subtotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'tax_total', default: 0, transformer: numericTransformer })
  taxTotal!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, name: 'grand_total', default: 0, transformer: numericTransformer })
  grandTotal!: number;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  currency!: string;

  @Column({ type: 'varchar', length: 50, name: 'sat_status', nullable: true })
  satStatus?: string | null;

  @Column({ type: 'timestamp', name: 'issue_date', default: () => 'NOW()' })
  issueDate!: Date;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => InvoiceDocumentEntity, (d) => d.invoice)
  documents?: InvoiceDocumentEntity[];
}
