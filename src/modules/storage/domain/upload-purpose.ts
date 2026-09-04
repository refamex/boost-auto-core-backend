/**
 * What a caller is allowed to upload, and how big.
 *
 * WHY A PURPOSE INSTEAD OF A FREE-FORM PATH: the browser asks for a presigned
 * URL and then PUTs straight to S3 — after that moment nothing of ours sees the
 * bytes. So every rule that will ever be enforced has to be decided HERE, at
 * signing time: the content type, the size ceiling, the key prefix, and which
 * permission the caller needs. A caller-supplied key would let one signature
 * write anywhere in the bucket, including over another product's image.
 *
 * Pure like `parcel-from-lines.ts`: nothing under `domain/` imports
 * `@nestjs/common`, so the rules can be read and tested without a module.
 */

export const UPLOAD_PURPOSES = ['product-image', 'invoice-document'] as const;

export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export interface PurposeRule {
  /** Exact MIME types. No wildcards: `image/*` also matches `image/svg+xml`,
   *  which is a script container the browser will happily execute. */
  contentTypes: readonly string[];
  maxBytes: number;
  /** Key prefix in the bucket. Uploads of one purpose can never land in another. */
  prefix: string;
  /** The `@Roles(...)` string the caller must hold to get a signature. */
  permission: string;
}

const MB = 1024 * 1024;

export const PURPOSE_RULES: Record<UploadPurpose, PurposeRule> = {
  /**
   * Catalogue photography. 10 MB is generous for a 700×700 product shot and
   * still small enough that a mistake is cheap to store and quick to serve.
   * WebP is included because it is what a modern export produces; SVG is
   * excluded on purpose.
   */
  'product-image': {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * MB,
    prefix: 'products',
    permission: 'pim:write',
  },
  /**
   * The PDF and XML of an invoice. The XML matters: it is the fiscal document
   * itself, and today `billing.invoice_documents.file_url` holds a URL the
   * client typed, pointing anywhere at all.
   */
  'invoice-document': {
    contentTypes: ['application/pdf', 'application/xml', 'text/xml'],
    maxBytes: 20 * MB,
    prefix: 'invoices',
    permission: 'billing:write',
  },
};

export type UploadRejection =
  | { reason: 'unknown-purpose' }
  | { reason: 'content-type'; allowed: readonly string[] }
  | { reason: 'too-large'; maxBytes: number };

export type UploadCheck =
  | { ok: true; rule: PurposeRule }
  | { ok: false; rejection: UploadRejection };

export function isUploadPurpose(value: string): value is UploadPurpose {
  return (UPLOAD_PURPOSES as readonly string[]).includes(value);
}

/**
 * Whether this upload may be signed.
 *
 * Returns the reason rather than a boolean because the caller has to say what
 * to fix: "that file is too big" and "we do not accept that format" send a
 * person to two different actions, and a single "upload failed" sends them to
 * neither.
 */
export function checkUpload(input: {
  purpose: string;
  contentType: string;
  size: number;
}): UploadCheck {
  if (!isUploadPurpose(input.purpose)) {
    return { ok: false, rejection: { reason: 'unknown-purpose' } };
  }

  const rule = PURPOSE_RULES[input.purpose];

  // Browsers append parameters (`text/xml; charset=utf-8`), and the comparison
  // has to survive that without loosening into a prefix match.
  const bare = input.contentType.split(';')[0].trim().toLowerCase();
  if (!rule.contentTypes.includes(bare)) {
    return {
      ok: false,
      rejection: { reason: 'content-type', allowed: rule.contentTypes },
    };
  }

  if (!Number.isFinite(input.size) || input.size <= 0) {
    return {
      ok: false,
      rejection: { reason: 'too-large', maxBytes: rule.maxBytes },
    };
  }

  if (input.size > rule.maxBytes) {
    return {
      ok: false,
      rejection: { reason: 'too-large', maxBytes: rule.maxBytes },
    };
  }

  return { ok: true, rule };
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
};

/**
 * The object key, built entirely from server-side values.
 *
 * NO PART OF THIS COMES FROM THE CALLER except the purpose, which is validated
 * above. Not the original filename either: a name like `../../config.json`, or
 * one that merely collides with an existing key, is a way to write somewhere it
 * should not. The date segments are for humans reading the bucket, nothing more.
 */
export function buildObjectKey(
  rule: PurposeRule,
  contentType: string,
  id: string,
  now: Date,
): string {
  const bare = contentType.split(';')[0].trim().toLowerCase();
  const ext = EXTENSIONS[bare] ?? 'bin';
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${rule.prefix}/${yyyy}/${mm}/${id}.${ext}`;
}
