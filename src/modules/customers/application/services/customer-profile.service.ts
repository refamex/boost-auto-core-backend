import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import {
  PaginatedResult,
  paginated,
} from '../../../../shared/common/pagination/pagination.dto';
import { canLink } from '../../domain/customer-link';
import { buildWhere } from '../../domain/customer-visibility';
import { CustomerProfileEntity } from '../../domain/entities/customer-profile.entity';
import {
  CreateCustomerDto,
  CustomerQueryDto,
  ReassignCustomerOwnerDto,
  UpdateCustomerDto,
} from '../../infrastructure/http/dto/customer.dto';

@Injectable()
export class CustomerProfileService {
  constructor(
    @InjectRepository(CustomerProfileEntity)
    private readonly repo: Repository<CustomerProfileEntity>,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: CustomerQueryDto,
  ): Promise<PaginatedResult<CustomerProfileEntity>> {
    const where = buildWhere(user, query);
    if (!where) return paginated<CustomerProfileEntity>([], 0, query);

    const [rows, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    return paginated(rows, total, query);
  }

  findById(
    id: string,
    user: AuthenticatedUser,
  ): Promise<CustomerProfileEntity> {
    return this.loadVisible(id, user);
  }

  /**
   * Cross-context lookup for the follow-on orders/sales/billing/quotes
   * change: those contexts all carry the auth-issued id, never this surrogate
   * `id`. Deliberately unscoped — callers are other bounded contexts calling
   * in-process, not an end-user request.
   */
  findByAuthCustomerId(
    authCustomerId: string,
  ): Promise<CustomerProfileEntity | null> {
    return this.repo.findOne({ where: { authCustomerId } });
  }

  /**
   * `ownerSalesRepId` is stamped from the JWT only — `CreateCustomerDto` has
   * no such field (D7), so a body attempt is already rejected upstream by the
   * global `ValidationPipe` (400) before this method ever runs.
   */
  async create(
    user: AuthenticatedUser,
    dto: CreateCustomerDto,
  ): Promise<CustomerProfileEntity> {
    const isAdmin = user.roles.includes('customers:admin');
    if (!isAdmin && !user.salesRepId) {
      throw new UnprocessableEntityException(
        'a salesRepId claim is required to create a customer profile',
      );
    }

    const profile = this.repo.create({
      ...dto,
      ownerSalesRepId: user.salesRepId ?? null,
    });

    try {
      return await this.repo.save(profile);
    } catch (err) {
      throw this.translateDuplicateAuthCustomerId(err, dto.authCustomerId);
    }
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateCustomerDto,
  ): Promise<CustomerProfileEntity> {
    const existing = await this.loadVisible(id, user);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  /** `@Roles('customers:admin')` on the route is the enforcement point; this
   * guards the exported service against being called without it. */
  async reassignOwner(
    id: string,
    user: AuthenticatedUser,
    dto: ReassignCustomerOwnerDto,
  ): Promise<CustomerProfileEntity> {
    const existing = await this.loadVisible(id, user);
    existing.ownerSalesRepId = dto.ownerSalesRepId;
    return this.repo.save(existing);
  }

  /**
   * Attaches an auth-issued id to a currently-unlinked profile via a
   * compare-and-set `UPDATE` (D3). `affected !== 1` after the visibility
   * check means the row was already linked between the read and the write —
   * 409, since a 403 would confirm the row exists.
   */
  async link(
    id: string,
    user: AuthenticatedUser,
    authCustomerId: string,
  ): Promise<CustomerProfileEntity> {
    const existing = await this.loadVisible(id, user);
    if (!canLink(existing.authCustomerId)) {
      throw new ConflictException(
        `customer ${id} is already linked to an auth customer`,
      );
    }

    let affected = 0;
    try {
      const result = await this.repo.update(
        { id, authCustomerId: IsNull() },
        { authCustomerId },
      );
      affected = result.affected ?? 0;
    } catch (err) {
      throw this.translateDuplicateAuthCustomerId(err, authCustomerId);
    }

    if (affected !== 1) {
      throw new ConflictException(
        `customer ${id} is already linked to an auth customer`,
      );
    }

    existing.authCustomerId = authCustomerId;
    return existing;
  }

  private async loadVisible(
    id: string,
    user: AuthenticatedUser,
  ): Promise<CustomerProfileEntity> {
    const where = buildWhere(user, {});
    if (!where) throw new NotFoundException(`Customer ${id} not found`);

    const found = await this.repo.findOne({ where: { ...where, id } });
    if (!found) throw new NotFoundException(`Customer ${id} not found`);
    return found;
  }

  private translateDuplicateAuthCustomerId(
    err: unknown,
    authCustomerId?: string | null,
  ): unknown {
    if (this.isDuplicateKeyError(err)) {
      return new ConflictException(
        `auth customer ${authCustomerId} is already linked to another profile`,
      );
    }
    return err;
  }

  private isDuplicateKeyError(err: unknown): boolean {
    return (
      err instanceof QueryFailedError &&
      (err as { code?: string }).code === '23505'
    );
  }
}
