import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { PriceListEntity } from '../../domain/entities/price-list.entity';
import { PriceListService } from './price-list.service';

const DEFAULT_LIST = { id: 'list-default', code: 'RETAIL', isDefault: true };
const NAMED_LIST = { id: 'list-whl', code: 'WHOLESALE', isDefault: false };

function fkViolation(): QueryFailedError {
  const err = new QueryFailedError('DELETE', [], new Error('fk'));
  (err as unknown as { code: string }).code = '23503';
  return err;
}

describe('PriceListService', () => {
  const repo = { findOne: jest.fn(), remove: jest.fn() };
  let service: PriceListService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PriceListService,
        { provide: getRepositoryToken(PriceListEntity), useValue: repo },
      ],
    }).compile();
    service = moduleRef.get(PriceListService);
  });

  describe('findApplicable', () => {
    it('resolves the named list', async () => {
      repo.findOne.mockResolvedValue(NAMED_LIST);
      await expect(service.findApplicable('WHOLESALE')).resolves.toBe(
        NAMED_LIST,
      );
    });

    it('falls back to the default list when no code is given', async () => {
      repo.findOne.mockResolvedValue(DEFAULT_LIST);
      await expect(service.findApplicable()).resolves.toBe(DEFAULT_LIST);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { isDefault: true } });
    });

    it('throws 404 for a code that does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findApplicable('NOPE')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 400 when nothing is configured, keeping quotes fail-closed', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findApplicable()).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findApplicableOrNull', () => {
    it('resolves the default list exactly like the throwing variant', async () => {
      repo.findOne.mockResolvedValue(DEFAULT_LIST);
      await expect(service.findApplicableOrNull()).resolves.toBe(DEFAULT_LIST);
    });

    it('answers null when no default list is configured at all', async () => {
      // A catalogue that simply does not use price lists is not an error for
      // orders: they fall back to pim.product.price.
      repo.findOne.mockResolvedValue(null);
      await expect(service.findApplicableOrNull()).resolves.toBeNull();
    });

    it('still throws 404 for an explicitly named list that is missing', async () => {
      // Asking for a list by name and silently pricing off something else
      // would hide the misconfiguration behind a wrong charge.
      repo.findOne.mockResolvedValue(null);
      await expect(service.findApplicableOrNull('NOPE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('maps an in-use FK delete (23503) to ConflictException', async () => {
      repo.findOne.mockResolvedValue(NAMED_LIST);
      repo.remove.mockRejectedValue(fkViolation());
      await expect(service.remove(NAMED_LIST.id)).rejects.toThrow(
        ConflictException,
      );
      expect(repo.remove).toHaveBeenCalledWith(NAMED_LIST);
    });

    it('deletes an unused list', async () => {
      repo.findOne.mockResolvedValue(NAMED_LIST);
      repo.remove.mockResolvedValue(NAMED_LIST);
      await expect(service.remove(NAMED_LIST.id)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(NAMED_LIST);
    });
  });
});
