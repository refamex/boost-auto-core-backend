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

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  subtotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'tax_total',
    default: 0,
    transformer: numericTransformer,
  })
  taxTotal!: number;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
    name: 'grand_total',
    default: 0,
    transformer: numericTransformer,
  })
  grandTotal!: number;

  @Column({ type: 'varchar', length: 10, default: 'MXN' })
  currency!: string;

  // --- CFDI 4.0. Todas nullable: ninguna factura existente fue timbrada, y
  //     rellenarlas inventaria un hecho fiscal. ---
  @Column({ type: 'varchar', length: 10, name: 'cfdi_version', nullable: true })
  cfdiVersion?: string | null;

  @Column({
    type: 'varchar',
    length: 5,
    name: 'tipo_comprobante',
    nullable: true,
  })
  tipoComprobante?: string | null;

  @Column({ type: 'varchar', length: 25, nullable: true })
  serie?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  folio?: string | null;

  /** El folio fiscal. Unico en todo el SAT; unico tambien en esta tabla. */
  @Column({ type: 'uuid', name: 'uuid_fiscal', nullable: true })
  uuidFiscal?: string | null;

  @Column({ type: 'timestamptz', name: 'fecha_timbrado', nullable: true })
  fechaTimbrado?: Date | null;

  @Column({ type: 'text', name: 'sello_cfd', nullable: true })
  selloCfd?: string | null;

  @Column({ type: 'text', name: 'sello_sat', nullable: true })
  selloSat?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'no_certificado_emisor',
    nullable: true,
  })
  noCertificadoEmisor?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    name: 'no_certificado_sat',
    nullable: true,
  })
  noCertificadoSat?: string | null;

  @Column({ type: 'text', name: 'cadena_original_sat', nullable: true })
  cadenaOriginalSat?: string | null;

  @Column({ type: 'varchar', length: 3, name: 'forma_pago', nullable: true })
  formaPago?: string | null;

  @Column({ type: 'varchar', length: 6, name: 'metodo_pago', nullable: true })
  metodoPago?: string | null;

  @Column({ type: 'varchar', length: 5, name: 'uso_cfdi', nullable: true })
  usoCfdi?: string | null;

  @Column({
    type: 'varchar',
    length: 5,
    name: 'regimen_fiscal_emisor',
    nullable: true,
  })
  regimenFiscalEmisor?: string | null;

  @Column({
    type: 'varchar',
    length: 5,
    name: 'regimen_fiscal_receptor',
    nullable: true,
  })
  regimenFiscalReceptor?: string | null;

  /** CP del domicilio fiscal del receptor. Obligatorio en 4.0 y no existia. */
  @Column({
    type: 'varchar',
    length: 10,
    name: 'domicilio_fiscal_receptor',
    nullable: true,
  })
  domicilioFiscalReceptor?: string | null;

  // --- Cancelacion. El SAT no borra: sustituye. ---
  @Column({
    type: 'varchar',
    length: 30,
    name: 'cancel_status',
    nullable: true,
  })
  cancelStatus?: string | null;

  /** Clave del catalogo c_MotivoCancelacion. `01` exige `uuidSustitucion`. */
  @Column({ type: 'varchar', length: 3, name: 'cancel_motivo', nullable: true })
  cancelMotivo?: string | null;

  @Column({ type: 'uuid', name: 'uuid_sustitucion', nullable: true })
  uuidSustitucion?: string | null;

  @Column({ type: 'timestamptz', name: 'cancelled_at', nullable: true })
  cancelledAt?: Date | null;

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
