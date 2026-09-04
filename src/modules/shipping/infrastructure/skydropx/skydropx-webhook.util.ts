import { timingSafeEqual } from 'node:crypto';

// Skydropx no firma el cuerpo del webhook. En el panel se elige
// "Método de autenticación: Token" y ese token viaja tal cual en el header
// Authorization de cada entrega.
export const SKYDROPX_AUTH_HEADER = 'authorization';

const SCHEME_PREFIX = /^(?:bearer|token)\s+/i;

/**
 * Valida el token estático que Skydropx envía en cada entrega del webhook.
 * Acepta el token pelado o precedido por "Bearer"/"Token", porque el esquema
 * puede venir escrito en el panel o agregado por Skydropx.
 */
export function isValidSkydropxWebhookToken(
  header: string | undefined,
  expectedToken: string,
): boolean {
  const received = normalize(header);
  const expected = normalize(expectedToken);
  if (!received || !expected) return false;

  const receivedBuf = Buffer.from(received, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (receivedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(receivedBuf, expectedBuf);
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().replace(SCHEME_PREFIX, '');
}
