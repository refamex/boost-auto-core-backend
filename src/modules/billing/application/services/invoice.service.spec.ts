import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import { InvoiceService } from './invoice.service';

const INVOICE_ID = 'invoice-1';

const customer: AuthenticatedUser = { id: 'customer-1', roles: [] };
const staff: AuthenticatedUser = { id: 'admin-user', roles: ['admin'] };

function makeInvoice(over: Partial<InvoiceEntity> = {}): InvoiceEntity {
  return {
    id: INVOICE_ID,
    invoiceNumber: 'INV-1',
    customerId: 'customer-1',
    ...over,
  } as InvoiceEntity;
}

describe('InvoiceService', () => {
  const invoiceRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
    merge: jest.fn((existing: object, dto: object) => ({
      ...existing,
      ...dto,
    })),
    remove: jest.fn(),
  };
  const documentRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
    remove: jest.fn(),
  };
  const events = { emit: jest.fn() };

  let service: InvoiceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InvoiceService(
      invoiceRepo as never,
      documentRepo as never,
      events as never,
    );
  });

  describe('list', () => {
    it('short-circuits to an empty page without querying when the requested customerId is not the caller own', async () => {
      const result = await service.list(customer, {
        customerId: 'someone-else',
      });
      expect(result).toEqual([]);
      expect(invoiceRepo.find).not.toHaveBeenCalled();
    });

    it('queries scoped by the shared ownership predicate otherwise', async () => {
      invoiceRepo.find.mockResolvedValue([makeInvoice()]);
      await service.list(customer, {});
      expect(invoiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { customerId: 'customer-1' } }),
      );
    });

    it('leaves a billing admin unfiltered', async () => {
      invoiceRepo.find.mockResolvedValue([]);
      await service.list(staff, {});
      expect(invoiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });
  });

  describe('findById', () => {
    it('returns 404, never a forbidden error, when ownership excludes the row', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.findById(INVOICE_ID, customer)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('applies the same predicate list uses', async () => {
      invoiceRepo.findOne.mockResolvedValue(makeInvoice());
      await service.findById(INVOICE_ID, customer);
      expect(invoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: INVOICE_ID },
        }),
      );
    });
  });

  describe('listDocuments', () => {
    it('404s on a foreign invoice and never reads the document table', async () => {
      invoiceRepo.findOne.mockResolvedValue(null);
      await expect(service.listDocuments(INVOICE_ID, customer)).rejects.toThrow(
        NotFoundException,
      );
      expect(documentRepo.find).not.toHaveBeenCalled();
    });

    it('resolves the parent invoice through the scoped predicate', async () => {
      invoiceRepo.findOne.mockResolvedValue(makeInvoice());
      documentRepo.find.mockResolvedValue([]);
      await service.listDocuments(INVOICE_ID, customer);
      expect(invoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: 'customer-1', id: INVOICE_ID },
        }),
      );
    });
  });

  // Trap verification: the three staff write paths must still resolve the
  // invoice UNSCOPED. Ownership-based write authorization is deliberately
  // out of scope here, exactly as it is for orders — these routes are
  // already gated on `billing:write`. A scoped lookup would silently break
  // a non-admin operator holding that permission.
  describe('staff write paths still resolve unscoped', () => {
    beforeEach(() => {
      invoiceRepo.findOne.mockResolvedValue(makeInvoice());
    });

    it('update', async () => {
      await service.update(INVOICE_ID, {});
      expect(invoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVOICE_ID } }),
      );
    });

    it('remove', async () => {
      await service.remove(INVOICE_ID);
      expect(invoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVOICE_ID } }),
      );
    });

    it('addDocument', async () => {
      await service.addDocument(INVOICE_ID, { storagePath: 'x' } as never);
      expect(invoiceRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVOICE_ID } }),
      );
    });

    it('addDocument still announces the invoice to its owner', async () => {
      await service.addDocument(INVOICE_ID, { storagePath: 'x' } as never);
      expect(events.emit).toHaveBeenCalledWith(
        'invoice.available',
        expect.objectContaining({
          recipientUserId: 'customer-1',
          entityId: INVOICE_ID,
        }),
      );
    });
  });
});
