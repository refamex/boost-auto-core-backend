import { Injectable } from '@nestjs/common';
import {
  CancelInput,
  CancelOutcome,
  StampOutcome,
  StampingProvider,
} from '../../domain/stamping.port';

const NO_PAC =
  'No hay un PAC configurado. El timbrado fiscal requiere contratar un proveedor autorizado y cargar los certificados CSD del SAT.';

/**
 * La implementacion honesta mientras no haya PAC.
 *
 * Responde `unavailable` siempre. NUNCA un exito: un UUID inventado se guarda
 * en la base, se imprime en un PDF y se le entrega a alguien que cree tener una
 * factura valida ante el SAT. El dia que descubre que no la tiene, ya paso el
 * plazo para emitirla bien.
 *
 * Cuando se contrate el proveedor, esto se reemplaza por su adaptador en
 * `BillingModule` y nada mas cambia.
 */
@Injectable()
export class UnconfiguredStampingProvider implements StampingProvider {
  // Both parameters are part of the port and are deliberately ignored: this
  // adapter answers the same way whatever it is asked.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  stamp(_invoiceId: string): Promise<StampOutcome> {
    return Promise.resolve({ status: 'unavailable', reason: NO_PAC });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cancel(_input: CancelInput): Promise<CancelOutcome> {
    return Promise.resolve({ status: 'unavailable', reason: NO_PAC });
  }
}
