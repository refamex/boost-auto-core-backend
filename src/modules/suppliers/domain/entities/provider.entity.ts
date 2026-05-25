import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { ProviderBranchEntity } from './provider-branch.entity';

@Entity({ schema: 'suppliers', name: 'provider' })
export class ProviderEntity {
  @PrimaryGeneratedColumn({ type: 'integer' })
  id!: number;

  @Column({ type: 'text', nullable: true })
  name?: string | null;

  @Column({ type: 'text', nullable: true })
  direction?: string | null;

  @Column({ type: 'text', nullable: true })
  city?: string | null;

  @Column({ type: 'text', nullable: true })
  state?: string | null;

  @Column({ type: 'varchar', name: 'postal_code', nullable: true })
  postalCode?: string | null;

  @Column({ type: 'text', nullable: true })
  representative?: string | null;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ type: 'text', nullable: true })
  email?: string | null;

  @Column({ type: 'text', name: 'inventory_reading', nullable: true })
  inventoryReading?: string | null;

  @Column({ type: 'text', nullable: true })
  warranty?: string | null;

  @Column({ type: 'text', name: 'code_identity', nullable: true, unique: true })
  codeIdentity?: string | null;

  @OneToMany(() => ProviderBranchEntity, (b) => b.provider)
  branches!: ProviderBranchEntity[];
}
