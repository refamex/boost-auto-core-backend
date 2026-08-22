import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { isVisibleToUser } from '../../domain/customer-visibility';
import { CustomerBranchEntity } from '../../domain/entities/customer-branch.entity';
import {
  CreateCustomerBranchDto,
  UpdateCustomerBranchDto,
} from '../../infrastructure/http/dto/customer.dto';

/**
 * Address book per `customer_profile`. Callers reach this service after the
 * controller's `loadOwnedProfile` check on the profile-scoped route prefix
 * (`/v1/customers/:customerId/branches`); `findById`/`update`/`remove` also
 * re-check visibility here since the service is exported and may be called
 * directly, per D8.
 */
@Injectable()
export class CustomerBranchService {
  constructor(
    @InjectRepository(CustomerBranchEntity)
    private readonly repo: Repository<CustomerBranchEntity>,
    private readonly dataSource: DataSource,
  ) {}

  listByProfile(customerProfileId: string): Promise<CustomerBranchEntity[]> {
    return this.repo.find({
      where: { customerProfileId },
      order: { createdAt: 'ASC' },
    });
  }

  async findById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<CustomerBranchEntity> {
    const found = await this.repo.findOne({
      where: { id },
      relations: ['customerProfile'],
    });
    if (!found || !isVisibleToUser(found.customerProfile, user)) {
      throw new NotFoundException(`Branch ${id} not found`);
    }
    return found;
  }

  async create(
    customerProfileId: string,
    dto: CreateCustomerBranchDto,
  ): Promise<CustomerBranchEntity> {
    return this.dataSource.transaction(async (tx) => {
      if (dto.isMainBranch) {
        await this.demoteOtherMainBranches(tx, customerProfileId);
      }
      try {
        return await tx
          .getRepository(CustomerBranchEntity)
          .save(
            tx
              .getRepository(CustomerBranchEntity)
              .create({ customerProfileId, ...dto }),
          );
      } catch (err) {
        throw this.translateMainBranchConflict(err);
      }
    });
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateCustomerBranchDto,
  ): Promise<CustomerBranchEntity> {
    const existing = await this.findById(id, user);

    return this.dataSource.transaction(async (tx) => {
      const repo = tx.getRepository(CustomerBranchEntity);
      if (dto.isMainBranch === true && !existing.isMainBranch) {
        await this.demoteOtherMainBranches(tx, existing.customerProfileId, id);
      }
      try {
        return await repo.save(repo.merge(existing, dto));
      } catch (err) {
        throw this.translateMainBranchConflict(err);
      }
    });
  }

  /**
   * Always rejected, matching `ProviderBranchService.remove` — even when it
   * is the customer's only branch. The caller must promote a different
   * branch to main first.
   */
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const existing = await this.findById(id, user);
    if (existing.isMainBranch) {
      throw new ConflictException(
        'Cannot delete the main branch; promote another branch first',
      );
    }
    await this.repo.remove(existing);
  }

  private async demoteOtherMainBranches(
    tx: {
      getRepository: (
        e: typeof CustomerBranchEntity,
      ) => Repository<CustomerBranchEntity>;
    },
    customerProfileId: string,
    exceptId?: string,
  ): Promise<void> {
    const qb = tx
      .getRepository(CustomerBranchEntity)
      .createQueryBuilder()
      .update()
      .set({ isMainBranch: false })
      .where(
        'customer_profile_id = :customerProfileId AND is_main_branch = TRUE',
        {
          customerProfileId,
        },
      );
    if (exceptId) qb.andWhere('id <> :exceptId', { exceptId });
    await qb.execute();
  }

  private translateMainBranchConflict(err: unknown): unknown {
    if (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === '23505'
    ) {
      return new ConflictException(
        'another branch was promoted concurrently; retry',
      );
    }
    return err;
  }
}
