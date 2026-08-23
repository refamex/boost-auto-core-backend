import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CustomerProfileEntity } from './customer-profile.entity';

/**
 * Address book entry for a `customer_profile`. Address columns map 1:1 onto
 * the existing `ship_to_*` snapshot shape on `orders.orders` (deliberate
 * deviation from `suppliers.provider_branch`'s `address TEXT` + `city`, which
 * cannot feed Skydropx's structured shape) so the follow-on orders change can
 * copy from here without transforming fields.
 */
@Entity({ schema: 'customers', name: 'customer_branch' })
export class CustomerBranchEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'customer_profile_id' })
  customerProfileId!: string;

  @ManyToOne(() => CustomerProfileEntity, (profile) => profile.branches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_profile_id' })
  customerProfile?: CustomerProfileEntity;

  @Column({ type: 'varchar', length: 150, name: 'branch_name', nullable: true })
  branchName?: string | null;

  @Column({
    type: 'varchar',
    length: 150,
    name: 'contact_person',
    nullable: true,
  })
  contactPerson?: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string | null;

  @Column({
    type: 'varchar',
    length: 150,
    name: 'recipient_name',
    nullable: true,
  })
  recipientName?: string | null;

  @Column({ type: 'varchar', length: 150, nullable: true })
  company?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  street1?: string | null;

  @Column({ type: 'varchar', length: 20, name: 'postal_code', nullable: true })
  postalCode?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'area_level1', nullable: true })
  areaLevel1?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'area_level2', nullable: true })
  areaLevel2?: string | null;

  @Column({ type: 'varchar', length: 120, name: 'area_level3', nullable: true })
  areaLevel3?: string | null;

  @Column({ type: 'varchar', length: 2, name: 'country_code', default: 'MX' })
  countryCode!: string;

  @Column({ type: 'boolean', name: 'is_main_branch', default: false })
  isMainBranch!: boolean;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
