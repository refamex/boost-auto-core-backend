/**
 * El puerto del PAC. Sin implementacion, y eso es deliberado.
 *
 * Timbrar exige un PAC contratado y los certificados CSD del SAT — decisiones
 * comerciales que ningun codigo puede tomar. Lo que si se puede dejar cerrado
 * hoy es la forma del contrato, para que el dia que exista el proveedor sea UN
 * adaptador y no un rediseno del modulo de facturacion.
 *
 * LO QUE NUNCA VA A HACER ESTE PUERTO: devolver un exito falso. Un UUID
 * inventado se guarda en la base, se imprime en un PDF y se le entrega a un
 * cliente que cree tener una factura valida. Cuando no hay PAC configurado, la
 * respuesta es `unavailable`, y el modulo la propaga como tal.
 */

export const STAMPING_PROVIDER = Symbol('STAMPING_PROVIDER');

/** Lo que el SAT devuelve cuando un comprobante queda timbrado. */
export interface StampResult {
  uuidFiscal: string;
  fechaTimbrado: string;
  selloCfd: string;
  selloSat: string;
  noCertificadoEmisor: string;
  noCertificadoSat: string;
  cadenaOriginalSat: string;
  /** El XML timbrado. Es EL comprobante fiscal; el PDF es una representacion. */
  xml: string;
}

export type StampOutcome =
  | { status: 'stamped'; result: StampResult }
  /** No hay PAC configurado. NO es un fallo del comprobante. */
  | { status: 'unavailable'; reason: string }
  /** El PAC rechazo el comprobante y dijo por que (codigo del SAT). */
  | { status: 'rejected'; code: string; message: string };

export type CancelOutcome =
  | { status: 'cancelled'; cancelledAt: string; acuse: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'rejected'; code: string; message: string };

/**
 * `motivo` es la clave del catalogo SAT c_MotivoCancelacion:
 *   01 comprobante con errores CON relacion  -> exige `uuidSustitucion`
 *   02 comprobante con errores SIN relacion
 *   03 no se llevo a cabo la operacion
 *   04 operacion nominativa relacionada en la global
 */
export interface CancelInput {
  uuidFiscal: string;
  motivo: '01' | '02' | '03' | '04';
  uuidSustitucion?: string;
}

export interface StampingProvider {
  stamp(invoiceId: string): Promise<StampOutcome>;
  cancel(input: CancelInput): Promise<CancelOutcome>;
}
