import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { CustomerBranchEntity } from '../../domain/entities/customer-branch.entity';
import { CustomerBranchService } from './customer-branch.service';

const REP_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_REP_ID = '22222222-2222-4222-8222-222222222222';
const PROFILE_ID = '33333333-3333-4333-8333-333333333333';
const BRANCH_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH_ID = '55555555-5555-4555-8555-555555555555';

const rep: AuthenticatedUser = {
  id: 'rep-user',
  roles: ['customers:write'],
  salesRepId: REP_ID,
};
const otherRep: AuthenticatedUser = {
  id: 'other-rep-user',
  roles: ['customers:write'],
  salesRepId: OTHER_REP_ID,
};
const admin: AuthenticatedUser = {
  id: 'admin-user',
  roles: ['customers:write', 'customers:admin'],
};

function makeBranch(
  over: Partial<CustomerBranchEntity> = {},
): CustomerBranchEntity {
  return {
    id: BRANCH_ID,
    customerProfileId: PROFILE_ID,
    customerProfile: { id: PROFILE_ID, ownerSalesRepId: REP_ID },
    branchName: 'Bodega Centro',
    contactPerson: null,
    phone: null,
    email: null,
    recipientName: 'Juan Pérez',
    company: null,
    street1: 'Av. Siempre Viva 123',
    postalCode: '06000',
    areaLevel1: 'CDMX',
    areaLevel2: 'Cuauhtémoc',
    areaLevel3: null,
    countryCode: 'MX',
    isMainBranch: false,
    isActive: true,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as CustomerBranchEntity;
}

function duplicateKeyError(): QueryFailedError {
  const err = new QueryFailedError('UPDATE', [], new Error('duplicate key'));
  (err as unknown as { code: string }).code = '23505';
  return err;
}

describe('CustomerBranchService', () => {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  };

  // The transaction callback receives repositories keyed by entity class,
  // the same shape `quote.service.spec.ts` and `provider-branch.service.ts` use.
  const txRepo = {
    createQueryBuilder: jest.fn(),
    create: jest.fn((x: unknown) => x),
    save: jest.fn((x: unknown) =>
      Promise.resolve({ id: BRANCH_ID, ...(x as object) }),
    ),
    merge: jest.fn((entity: object, dto: object) => Object.assign(entity, dto)),
  };
  const updateQb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const dataSource = {
    transaction: jest.fn((fn: (t: unknown) => unknown) =>
      fn({ getRepository: jest.fn(() => txRepo) }),
    ),
  };

  let service: CustomerBranchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    txRepo.createQueryBuilder.mockReturnValue(updateQb);
    updateQb.execute.mockResolvedValue({ affected: 1 });
    txRepo.save.mockImplementation((x: unknown) =>
      Promise.resolve({ id: BRANCH_ID, ...(x as object) }),
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        CustomerBranchService,
        { provide: getRepositoryToken(CustomerBranchEntity), useValue: repo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(CustomerBranchService);
  });

  describe('create', () => {
    it('demotes the current main branch before promoting the new one', async () => {
      await service.create(PROFILE_ID, {
        branchName: 'Nueva',
        isMainBranch: true,
      });
      expect(txRepo.createQueryBuilder).toHaveBeenCalled();
      expect(updateQb.set).toHaveBeenCalledWith({ isMainBranch: false });
      expect(updateQb.where).toHaveBeenCalledWith(
        expect.stringContaining('customer_profile_id'),
        expect.objectContaining({ customerProfileId: PROFILE_ID }),
      );
    });

    it('does not demote anything when the new branch is not main', async () => {
      await service.create(PROFILE_ID, { branchName: 'Secundaria' });
      expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('translates a concurrent promotion conflict (23505) into 409', async () => {
      txRepo.save.mockRejectedValueOnce(duplicateKeyError());
      await expect(
        service.create(PROFILE_ID, { branchName: 'Nueva', isMainBranch: true }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('demotes the previous main branch when promoting this one', async () => {
      repo.findOne.mockResolvedValue(makeBranch({ isMainBranch: false }));
      await service.update(BRANCH_ID, rep, { isMainBranch: true });
      expect(txRepo.createQueryBuilder).toHaveBeenCalled();
      expect(updateQb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('id'),
        expect.objectContaining({ exceptId: BRANCH_ID }),
      );
    });

    it('a scoped miss (branch under another rep) is 404, never 403', async () => {
      repo.findOne.mockResolvedValue(makeBranch()); // owned by REP_ID
      await expect(
        service.update(BRANCH_ID, otherRep, { branchName: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('blocks deleting the main branch while another branch exists', async () => {
      repo.findOne.mockResolvedValue(makeBranch({ isMainBranch: true }));
      await expect(service.remove(BRANCH_ID, rep)).rejects.toThrow(
        ConflictException,
      );
      expect(repo.remove).not.toHaveBeenCalled();
    });

    it('blocks deleting the sole main branch too', async () => {
      repo.findOne.mockResolvedValue(
        makeBranch({ id: OTHER_BRANCH_ID, isMainBranch: true }),
      );
      await expect(service.remove(OTHER_BRANCH_ID, rep)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deletes a non-main branch', async () => {
      repo.findOne.mockResolvedValue(makeBranch({ isMainBranch: false }));
      await service.remove(BRANCH_ID, rep);
      expect(repo.remove).toHaveBeenCalled();
    });

    it('an unknown branch id is 404', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(BRANCH_ID, rep)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('admin can read a branch under any profile', async () => {
      repo.findOne.mockResolvedValue(makeBranch());
      const found = await service.findById(BRANCH_ID, admin);
      expect(found.id).toBe(BRANCH_ID);
    });

    it('a rep outside the owning profile gets 404, never 403', async () => {
      repo.findOne.mockResolvedValue(makeBranch());
      await expect(service.findById(BRANCH_ID, otherRep)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listByProfile', () => {
    it('lists every branch under the profile', async () => {
      repo.find.mockResolvedValue([
        makeBranch(),
        makeBranch({ id: OTHER_BRANCH_ID }),
      ]);
      const list = await service.listByProfile(PROFILE_ID);
      expect(list).toHaveLength(2);
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerProfileId: PROFILE_ID } }),
      );
    });
  });
});
