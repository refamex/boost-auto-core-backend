import {
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import { STAMPING_PROVIDER } from '../../domain/stamping.port';
import { UnconfiguredStampingProvider } from '../../infrastructure/pac/unconfigured-stamping.provider';
import { StampingService } from './stamping.service';

/**
 * Este módulo NO timbra todavía, y la prueba de que eso está bien hecho es que
 * falla ruidosamente en vez de inventar un folio fiscal.
 */
describe('StampingService', () => {
  const complete = (over: Partial<InvoiceEntity> = {}): InvoiceEntity =>
    ({
      id: 'inv-1',
      invoiceNumber: 'INV-1',
      rfc: 'AAA010101AAA',
      legalName: 'ACME S.A. de C.V.',
      usoCfdi: 'G03',
      regimenFiscalReceptor: '601',
      domicilioFiscalReceptor: '64000',
      ...over,
    }) as InvoiceEntity;

  const repo = { findOne: jest.fn(), save: jest.fn((x: unknown) => x) };
  const pac = { stamp: jest.fn(), cancel: jest.fn() };

  let service: StampingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.save.mockImplementation((x: unknown) => Promise.resolve(x));

    const moduleRef = await Test.createTestingModule({
      providers: [
        StampingService,
        { provide: getRepositoryToken(InvoiceEntity), useValue: repo },
        { provide: STAMPING_PROVIDER, useValue: pac },
      ],
    }).compile();
    service = moduleRef.get(StampingService);
  });

  describe('missingFiscalData', () => {
    it('no reporta nada cuando la factura está completa', () => {
      expect(service.missingFiscalData(complete())).toEqual([]);
    });

    it('nombra TODO lo que falta, no sólo lo primero', () => {
      // Quien captura necesita ver la lista entera de una vez, o completa un
      // campo y choca contra el siguiente.
      const invoice = complete({
        usoCfdi: null,
        regimenFiscalReceptor: null,
        domicilioFiscalReceptor: null,
      });
      expect(service.missingFiscalData(invoice)).toEqual([
        'usoCfdi',
        'regimenFiscalReceptor',
        'domicilioFiscalReceptor',
      ]);
    });

    it('trata los espacios en blanco como ausencia', () => {
      expect(service.missingFiscalData(complete({ rfc: '   ' }))).toContain(
        'rfc',
      );
    });
  });

  describe('stamp', () => {
    it('responde 503 sin PAC configurado, nunca un folio inventado', async () => {
      repo.findOne.mockResolvedValue(complete());
      pac.stamp.mockResolvedValue({
        status: 'unavailable',
        reason: 'no hay PAC',
      });

      await expect(service.stamp('inv-1')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rechaza antes de llamar al PAC cuando faltan datos fiscales', async () => {
      // Un timbre rechazado por el SAT consume tiempo y, con algunos PACs,
      // dinero. Lo que podemos validar nosotros se valida acá.
      repo.findOne.mockResolvedValue(complete({ usoCfdi: null }));

      await expect(service.stamp('inv-1')).rejects.toThrow(ConflictException);
      expect(pac.stamp).not.toHaveBeenCalled();
    });

    it('se niega a timbrar dos veces la misma factura', async () => {
      repo.findOne.mockResolvedValue(
        complete({ uuidFiscal: '11111111-1111-4111-8111-111111111111' }),
      );
      await expect(service.stamp('inv-1')).rejects.toThrow(ConflictException);
      expect(pac.stamp).not.toHaveBeenCalled();
    });

    it('propaga el rechazo del SAT con su código', async () => {
      repo.findOne.mockResolvedValue(complete());
      pac.stamp.mockResolvedValue({
        status: 'rejected',
        code: 'CFDI40147',
        message: 'RFC no registrado',
      });

      await expect(service.stamp('inv-1')).rejects.toThrow(/CFDI40147/);
    });

    it('persiste el timbre cuando el PAC responde', async () => {
      const invoice = complete();
      repo.findOne.mockResolvedValue(invoice);
      pac.stamp.mockResolvedValue({
        status: 'stamped',
        result: {
          uuidFiscal: '22222222-2222-4222-8222-222222222222',
          fechaTimbrado: '2026-09-03T18:00:00Z',
          selloCfd: 'sello-cfd',
          selloSat: 'sello-sat',
          noCertificadoEmisor: '30001000000400002434',
          noCertificadoSat: '30001000000400002495',
          cadenaOriginalSat: '||1.1|...||',
          xml: '<cfdi:Comprobante/>',
        },
      });

      await service.stamp('inv-1');

      expect(invoice.uuidFiscal).toBe('22222222-2222-4222-8222-222222222222');
      expect(invoice.cfdiVersion).toBe('4.0');
      expect(invoice.satStatus).toBe('vigente');
    });
  });

  describe('cancel', () => {
    it('exige uuidSustitucion cuando el motivo es 01', async () => {
      // El SAT rechaza la cancelación entera sin él: motivo 01 significa
      // literalmente "con relación", y hay que decir con cuál.
      repo.findOne.mockResolvedValue(
        complete({ uuidFiscal: '33333333-3333-4333-8333-333333333333' }),
      );

      await expect(
        service.cancel('inv-1', { motivo: '01' }),
      ).rejects.toThrow(ConflictException);
      expect(pac.cancel).not.toHaveBeenCalled();
    });

    it('acepta el motivo 01 con su sustitución', async () => {
      repo.findOne.mockResolvedValue(
        complete({ uuidFiscal: '33333333-3333-4333-8333-333333333333' }),
      );
      pac.cancel.mockResolvedValue({ status: 'unavailable', reason: 'no PAC' });

      await expect(
        service.cancel('inv-1', {
          motivo: '01',
          uuidSustitucion: '44444444-4444-4444-8444-444444444444',
        }),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(pac.cancel).toHaveBeenCalled();
    });

    it('no cancela algo que nunca se timbró', async () => {
      repo.findOne.mockResolvedValue(complete({ uuidFiscal: null }));
      await expect(service.cancel('inv-1', { motivo: '02' })).rejects.toThrow(
        ConflictException,
      );
    });
  });
});

/**
 * El proveedor que existe mientras no haya PAC. Su único trabajo es no mentir.
 */
describe('UnconfiguredStampingProvider', () => {
  const provider = new UnconfiguredStampingProvider();

  it('nunca responde "stamped"', async () => {
    const outcome = await provider.stamp('inv-1');
    expect(outcome.status).toBe('unavailable');
  });

  it('explica qué falta, no sólo que falló', async () => {
    const outcome = await provider.stamp('inv-1');
    if (outcome.status !== 'unavailable') throw new Error('unreachable');
    expect(outcome.reason).toMatch(/PAC/);
    expect(outcome.reason).toMatch(/CSD/);
  });

  it('tampoco cancela', async () => {
    expect((await provider.cancel({ uuidFiscal: 'u', motivo: '02' })).status).toBe(
      'unavailable',
    );
  });
});
