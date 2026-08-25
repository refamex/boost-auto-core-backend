import { createHmac, timingSafeEqual } from 'node:crypto';

// Header donde Skydropx envía la firma del webhook.
// NOTA: confirmar el nombre exacto en la sección Webhooks de los api-docs.
export const SKYDROPX_SIGNATURE_HEADER = 'x-skydropx-signature';

/**
 * Valida la firma HMAC-SHA256 del webhook de Skydropx sobre el cuerpo crudo.
 * Devuelve true si la firma coincide con el secret configurado.
 */
export function isValidSkydropxSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  // La firma puede venir como "sha256=<hex>" o solo "<hex>".
  const received = signature.includes('=')
    ? signature.split('=').pop()!
    : signature;

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(received, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
