import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerBranchEntity } from './customer-branch.entity';

/**
 * Commercial customer profile, keyed by a core-owned surrogate `id`.
 *
 * `authCustomerId` mirrors the auth-issued customer id carried by
 * orders/sales/billing/quotes. It starts NULL for a prospect a rep registers
 * before an identity exists in autoboost-backend-auth, and is attached later
 * via the link-once guard in `customer-link.ts`. No FK — identity lives in a
 * different service, mirroring `QuoteEntity.customerId`.
 */
@Entity({ schema: 'customers', name: 'customer_profile' })
export class CustomerProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'auth_customer_id', nullable: true })
  authCustomerId?: string | null;

  /** NULL = unassigned house account, visible only to `customers:admin`. */
  @Column({ type: 'uuid', name: 'owner_sales_rep_id', nullable: true })
  ownerSalesRepId?: string | null;

  @Column({ type: 'varchar', length: 150, name: 'display_name' })
  displayName!: string;

  @Column({ type: 'varchar', length: 150, name: 'legal_name', nullable: true })
  legalName?: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  rfc?: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    name: 'customer_type',
    nullable: true,
  })
  customerType?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  /** The only delete mechanism for a profile — hard delete is out of scope. */
  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => CustomerBranchEntity, (branch) => branch.customerProfile)
  branches?: CustomerBranchEntity[];
}
