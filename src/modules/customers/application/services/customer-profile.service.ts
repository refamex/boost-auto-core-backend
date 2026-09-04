import {
  ConflictException,
  Injectable,
  Logger,
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
import { PriceListService } from '../../../commerce/application/services/price-list.service';
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
  private readonly logger = new Logger(CustomerProfileService.name);

  constructor(
    @InjectRepository(CustomerProfileEntity)
    private readonly repo: Repository<CustomerProfileEntity>,
    private readonly priceLists: PriceListService,
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

    await this.assertPriceListExists(dto.priceListCode);

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

  /**
   * The profile a shopper's own address book hangs off, creating it if this is
   * the first time they save an address.
   *
   * WHY AUTO-PROVISION: profiles are created by sales reps, and `create()`
   * above refuses a caller with no `salesRepId`. A shopper who signed up on the
   * storefront therefore has no row at all — so without this, "save my address"
   * would fail for exactly the people the address book is for.
   *
   * `ownerSalesRepId: null` is not a gap: the entity documents NULL as an
   * unassigned house account, which is precisely what a self-registered shopper
   * is until a rep claims them. `displayName` is the email because it is the
   * only human-readable thing the JWT carries; a rep renames it later.
   *
   * The 23505 catch is the concurrent-first-save case: two tabs, one partial
   * unique index on `auth_customer_id`. The loser re-reads instead of failing,
   * because both callers wanted the same row, not two rows.
   */
  async ensureSelfServiceProfile(
    user: AuthenticatedUser,
  ): Promise<CustomerProfileEntity> {
    const existing = await this.findByAuthCustomerId(user.id);
    if (existing) return existing;

    try {
      return await this.repo.save(
        this.repo.create({
          authCustomerId: user.id,
          displayName: user.email ?? user.id,
          email: user.email ?? null,
          ownerSalesRepId: null,
        }),
      );
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err as { code?: string }).code === '23505'
      ) {
        const raced = await this.findByAuthCustomerId(user.id);
        if (raced) return raced;
      }
      throw err;
    }
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateCustomerDto,
  ): Promise<CustomerProfileEntity> {
    const existing = await this.loadVisible(id, user);
    await this.assertPriceListExists(dto.priceListCode);
    return this.repo.save(this.repo.merge(existing, dto));
  }

  /**
   * Rejects an unknown price list at assignment time.
   *
   * The FK would catch it too, but as a 500 from a constraint name. What
   * matters more is *when*: a typo caught here is a 404 on the form the admin
   * is looking at, instead of a customer priced off the default list until
   * somebody notices the bill is wrong.
   *
   * `null` is a real value — it clears the assignment — so only a non-empty
   * code is checked.
   */
  private async assertPriceListExists(code?: string | null): Promise<void> {
    if (!code) return;
    await this.priceLists.findApplicableOrNull(code);
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

    await this.claimPendingQuotes(id, authCustomerId);

    existing.authCustomerId = authCustomerId;
    return existing;
  }

  /**
   * Hands the customer the quotes written for them before they had an account.
   *
   * A rep quotes people who have not signed up yet — that is the normal order
   * of a sale. Those quotes carry `customer_profile_id` and a NULL
   * `customer_id`, so `/v1/quotes/me` (which filters by the caller's own id)
   * cannot see them. Linking is the moment that identity finally exists, so it
   * is the moment to fill it in; otherwise the customer signs up and finds
   * nothing, and the rep's work is invisible to the only person it was for.
   *
   * WHY RAW SQL AND NOT THE QUOTE SERVICE: `quotes` already depends on
   * `customers` (it resolves profiles and price lists through this service).
   * Importing back would close a cycle for a single UPDATE. The table is
   * addressed directly instead, which is also why the WHERE clause is written
   * defensively — `customer_id IS NULL` makes this idempotent and unable to
   * overwrite a quote that already found its reader.
   *
   * Not wrapped in a transaction with the link above on purpose: the link is
   * the fact that matters and it is already committed. If this sweep fails,
   * re-running the link is impossible (link-once), so failing the whole call
   * would strand the profile. A missed quote is recoverable; a lost link is not.
   */
  private async claimPendingQuotes(
    profileId: string,
    authCustomerId: string,
  ): Promise<void> {
    try {
      await this.repo.manager.query(
        `UPDATE quotes.quotes
            SET customer_id = $1
          WHERE customer_profile_id = $2
            AND customer_id IS NULL`,
        [authCustomerId, profileId],
      );
    } catch (err) {
      this.logger.error(
        `Customer ${profileId} was linked to ${authCustomerId}, but its pending ` +
          `quotes could not be claimed. They stay invisible to the customer ` +
          `until this is re-run.`,
        err instanceof Error ? err.stack : String(err),
      );
    }
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
