import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { PriceListService } from '../../../commerce/application/services/price-list.service';
import { CustomerProfileEntity } from '../../domain/entities/customer-profile.entity';
import { CustomerProfileService } from './customer-profile.service';

const REP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_REP_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const AUTH_CUSTOMER_ID = '44444444-4444-4444-8444-444444444444';

const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: ['customers:write'],
  salesRepId: REP_ID,
};
const admin: AuthenticatedUser = {
  id: 'admin-user',
  roles: ['customers:write', 'customers:admin'],
};
const repNoClaim: AuthenticatedUser = {
  id: 'rep-user-no-claim',
  roles: ['customers:write'],
};

function makeProfile(
  over: Partial<CustomerProfileEntity> = {},
): CustomerProfileEntity {
  return {
    id: PROFILE_ID,
    authCustomerId: null,
    ownerSalesRepId: REP_ID,
    displayName: 'ACME Refacciones',
    legalName: null,
    rfc: null,
    customerType: null,
    email: null,
    phone: null,
    notes: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

/** A minimal duplicate-key error shaped like TypeORM's `QueryFailedError`. */
function duplicateKeyError(): QueryFailedError {
  const err = new QueryFailedError('INSERT', [], new Error('duplicate key'));
  (err as unknown as { code: string }).code = '23505';
  return err;
}

describe('CustomerProfileService', () => {
  const repo = {
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    merge: jest.fn((entity: object, dto: object) => Object.assign(entity, dto)),
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    update: jest.fn(),
  };

  const priceListService = {
    findApplicableOrNull: jest.fn(),
  };

  let service: CustomerProfileService;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.save.mockImplementation((x: unknown) => Promise.resolve(x));
    repo.create.mockImplementation((x: unknown) => x);
    priceListService.findApplicableOrNull.mockResolvedValue({});

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerProfileService,
        { provide: getRepositoryToken(CustomerProfileEntity), useValue: repo },
        { provide: PriceListService, useValue: priceListService },
      ],
    }).compile();
    service = moduleRef.get(CustomerProfileService);
  });

  describe('create', () => {
    it("stamps owner_sales_rep_id from the caller's JWT salesRepId claim", async () => {
      await service.create(rep, { displayName: 'ACME' });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerSalesRepId: REP_ID }),
      );
    });

    it('never reads an ownerSalesRepId smuggled onto the dto', async () => {
      const dtoWithSmuggledOwner = {
        displayName: 'ACME',
        ownerSalesRepId: OTHER_REP_ID,
      };
      await service.create(rep, dtoWithSmuggledOwner);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerSalesRepId: REP_ID }),
      );
    });

    it('creates an unowned house account for an admin with no rep claim', async () => {
      await service.create(admin, { displayName: 'House Account' });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerSalesRepId: null }),
      );
    });

    it('rejects a non-admin caller with no salesRepId claim (422)', async () => {
      await expect(
        service.create(repNoClaim, { displayName: 'ACME' }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('creates a prospect with a NULL auth_customer_id when none is given', async () => {
      await service.create(rep, { displayName: 'Prospecto' });
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Prospecto' }),
      );
      const created = repo.create.mock.calls[0][0] as {
        authCustomerId?: unknown;
      };
      expect(created.authCustomerId).toBeUndefined();
    });

    it('translates a duplicate auth_customer_id (23505) into 409', async () => {
      repo.save.mockRejectedValueOnce(duplicateKeyError());
      await expect(
        service.create(rep, {
          displayName: 'ACME',
          authCustomerId: AUTH_CUSTOMER_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates commercial fields without touching branches (no branch repo is injected here)', async () => {
      repo.findOne.mockResolvedValue(makeProfile());
      const updated = await service.update(PROFILE_ID, rep, {
        legalName: 'ACME SA de CV',
      });
      expect(updated.legalName).toBe('ACME SA de CV');
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('deactivating a profile only flips isActive', async () => {
      repo.findOne.mockResolvedValue(makeProfile({ isActive: true }));
      const updated = await service.update(PROFILE_ID, rep, {
        isActive: false,
      });
      expect(updated.isActive).toBe(false);
      expect(updated.displayName).toBe('ACME Refacciones');
    });

    it('a scoped miss (owned by another rep) is 404, never 403', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.update(PROFILE_ID, rep, { legalName: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('an unknown id is 404', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findById(PROFILE_ID, admin)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reassignOwner', () => {
    it('changes owner_sales_rep_id to the new rep', async () => {
      repo.findOne.mockResolvedValue(makeProfile({ ownerSalesRepId: REP_ID }));
      const updated = await service.reassignOwner(PROFILE_ID, admin, {
        ownerSalesRepId: OTHER_REP_ID,
      });
      expect(updated.ownerSalesRepId).toBe(OTHER_REP_ID);
    });
  });

  describe('link', () => {
    it('succeeds when the CAS affects exactly one row', async () => {
      repo.findOne.mockResolvedValue(makeProfile({ authCustomerId: null }));
      repo.update.mockResolvedValue({ affected: 1 });
      const linked = await service.link(PROFILE_ID, rep, AUTH_CUSTOMER_ID);
      expect(linked.authCustomerId).toBe(AUTH_CUSTOMER_ID);
      expect(repo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: PROFILE_ID }),
        { authCustomerId: AUTH_CUSTOMER_ID },
      );
    });

    it('rejects re-linking an already-linked profile before touching the DB', async () => {
      repo.findOne.mockResolvedValue(
        makeProfile({ authCustomerId: 'already-set' }),
      );
      await expect(
        service.link(PROFILE_ID, rep, AUTH_CUSTOMER_ID),
      ).rejects.toThrow(ConflictException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('the CAS affecting 0 rows (raced by another link) is 409', async () => {
      repo.findOne.mockResolvedValue(makeProfile({ authCustomerId: null }));
      repo.update.mockResolvedValue({ affected: 0 });
      await expect(
        service.link(PROFILE_ID, rep, AUTH_CUSTOMER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('a duplicate auth_customer_id on another profile (23505) is 409', async () => {
      repo.findOne.mockResolvedValue(makeProfile({ authCustomerId: null }));
      repo.update.mockRejectedValue(duplicateKeyError());
      await expect(
        service.link(PROFILE_ID, rep, AUTH_CUSTOMER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('linking an invisible profile is 404, never 403', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.link(PROFILE_ID, rep, AUTH_CUSTOMER_ID),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAuthCustomerId', () => {
    it('looks up unscoped, for cross-context consumers', async () => {
      repo.findOne.mockResolvedValue(
        makeProfile({ authCustomerId: AUTH_CUSTOMER_ID }),
      );
      const found = await service.findByAuthCustomerId(AUTH_CUSTOMER_ID);
      expect(found?.authCustomerId).toBe(AUTH_CUSTOMER_ID);
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { authCustomerId: AUTH_CUSTOMER_ID },
      });
    });

    it('returns null when nothing matches', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.findByAuthCustomerId(AUTH_CUSTOMER_ID)).toBeNull();
    });
  });
});
