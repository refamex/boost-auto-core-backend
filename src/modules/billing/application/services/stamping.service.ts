import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceEntity } from '../../domain/entities/invoice.entity';
import {
  CancelInput,
  STAMPING_PROVIDER,
  StampingProvider,
} from '../../domain/stamping.port';

/**
 * Timbrado fiscal. Hoy no timbra, y lo dice.
 *
 * Existe para que el dia que haya PAC el cambio sea un proveedor y no un
 * modulo nuevo: la validacion previa —que la factura tenga RFC, uso de CFDI,
 * regimen y codigo postal fiscal— es nuestra, no del PAC, y ya vive aca.
 *
 * NUNCA devuelve un exito falso. Un UUID inventado se guarda, se imprime y se
 * entrega a alguien que cree tener una factura valida ante el SAT.
 */
@Injectable()
export class StampingService {
  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    @Inject(STAMPING_PROVIDER) private readonly pac: StampingProvider,
  ) {}

  /**
   * Lo que le falta a una factura para poder timbrarse.
   *
   * Se devuelve la LISTA completa, no el primer faltante: quien captura los
   * datos necesita saber todo lo que le falta de una vez, o completa uno y
   * choca contra el siguiente.
   */
  missingFiscalData(invoice: InvoiceEntity): string[] {
    const missing: string[] = [];
    if (!invoice.rfc?.trim()) missing.push('rfc');
    if (!invoice.legalName?.trim()) missing.push('legalName');
    if (!invoice.usoCfdi?.trim()) missing.push('usoCfdi');
    if (!invoice.regimenFiscalReceptor?.trim()) {
      missing.push('regimenFiscalReceptor');
    }
    if (!invoice.domicilioFiscalReceptor?.trim()) {
      missing.push('domicilioFiscalReceptor');
    }
    return missing;
  }

  async stamp(invoiceId: string): Promise<InvoiceEntity> {
    const invoice = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);

    if (invoice.uuidFiscal) {
      throw new ConflictException(
        `Invoice ${invoiceId} is already stamped (${invoice.uuidFiscal})`,
      );
    }

    const missing = this.missingFiscalData(invoice);
    if (missing.length > 0) {
      throw new ConflictException(
        `Cannot stamp: the invoice is missing ${missing.join(', ')}`,
      );
    }

    const outcome = await this.pac.stamp(invoiceId);

    if (outcome.status === 'unavailable') {
      throw new ServiceUnavailableException(outcome.reason);
    }
    if (outcome.status === 'rejected') {
      throw new ConflictException(`SAT ${outcome.code}: ${outcome.message}`);
    }

    const r = outcome.result;
    invoice.uuidFiscal = r.uuidFiscal;
    invoice.fechaTimbrado = new Date(r.fechaTimbrado);
    invoice.selloCfd = r.selloCfd;
    invoice.selloSat = r.selloSat;
    invoice.noCertificadoEmisor = r.noCertificadoEmisor;
    invoice.noCertificadoSat = r.noCertificadoSat;
    invoice.cadenaOriginalSat = r.cadenaOriginalSat;
    invoice.cfdiVersion = '4.0';
    invoice.satStatus = 'vigente';

    return this.invoices.save(invoice);
  }

  async cancel(invoiceId: string, input: Omit<CancelInput, 'uuidFiscal'>) {
    const invoice = await this.invoices.findOne({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (!invoice.uuidFiscal) {
      throw new ConflictException(
        'Cannot cancel an invoice that was never stamped',
      );
    }
    // Motivo 01 significa "con relacion": el SAT exige decir cual comprobante
    // la sustituye, y sin eso rechaza la cancelacion entera.
    if (input.motivo === '01' && !input.uuidSustitucion) {
      throw new ConflictException(
        'Motivo 01 requires uuidSustitucion (the invoice that replaces this one)',
      );
    }

    const outcome = await this.pac.cancel({
      uuidFiscal: invoice.uuidFiscal,
      ...input,
    });

    if (outcome.status === 'unavailable') {
      throw new ServiceUnavailableException(outcome.reason);
    }
    if (outcome.status === 'rejected') {
      throw new ConflictException(`SAT ${outcome.code}: ${outcome.message}`);
    }

    invoice.cancelStatus = 'cancelado';
    invoice.cancelMotivo = input.motivo;
    invoice.uuidSustitucion = input.uuidSustitucion ?? null;
    invoice.cancelledAt = new Date(outcome.cancelledAt);
    invoice.satStatus = 'cancelado';

    return this.invoices.save(invoice);
  }
}
