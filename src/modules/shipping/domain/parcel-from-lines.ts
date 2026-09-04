/**
 * Builds the parcel a quote is asked about, from what the order actually
 * contains.
 *
 * Every quote until now was asked about `{weight: 1, length: 30, width: 20,
 * height: 10}` — a fixed box, hardcoded in the frontend, sent whether the order
 * held one brake pad or forty bumpers. The dimensions were there all along:
 * `pim.product_dimension` covers the catalogue.
 *
 * Pure on purpose, like `orders/domain/order-pricing.ts`: nothing under
 * `domain/` imports from `@nestjs/common`, so the packing rule can be read and
 * tested without standing up a module.
 */

export interface ParcelLine {
  productId: number;
  qty: number;
  sku: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
}

export interface Parcel {
  /** Kilograms, three decimals — how carriers bill. */
  weight: number;
  /** Centimetres, whole numbers rounded UP. A box is never smaller than asked. */
  length: number;
  width: number;
  height: number;
}

export type ParcelResult =
  | { ok: true; parcel: Parcel }
  | { ok: false; reason: 'missing-dimensions'; skus: string[] };

const ceil = (n: number): number => Math.ceil(n);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * One box, pieces stacked on their thinnest side.
 *
 *   weight = Σ (qty × weight)
 *   per line, sort its three dimensions descending: L ≥ W ≥ H
 *   length = max(L)    width = max(W)    height = Σ (qty × H)
 *
 * It survives being explained to whoever packs the box: "we stack the pieces on
 * their thinnest side, in a carton as long and wide as the biggest piece". It
 * grows with quantity, so more items never quote cheaper, and it never
 * understates weight — which is what carriers bill alongside the volumetric
 * figure `L×W×H/5000`.
 *
 * WHERE IT OVERSTATES: many small pieces that would really sit side by side
 * become a tall tower. Ten sets of brake pads quote as 30cm of height instead
 * of a 12cm carton. It fails toward the expensive side, never toward promising
 * a shipment that cannot happen.
 *
 * ONE PARCEL, deliberately: `skydropx-http.client.ts` sends `parcels: [{...}]`
 * with a single element. Splitting into N boxes needs the price display and
 * `createShipment` to handle N — a separate change, not a smaller one.
 *
 * NO SIZE GUARDRAIL HERE. Whether a carrier accepts a 250cm piece is Skydropx's
 * answer to give, not ours to guess: a third of this catalogue exceeds ordinary
 * parcel limits, and refusing it up front would block those sales on our
 * opinion. If nobody covers it, the quote comes back with zero rates, and that
 * is a different message than a failure.
 */
export function parcelFromLines(lines: ParcelLine[]): ParcelResult {
  if (lines.length === 0) {
    return { ok: false, reason: 'missing-dimensions', skus: [] };
  }

  // Weight is the one figure with no safe substitute. Defaulting a missing one
  // to 1kg would reintroduce exactly the fiction this function exists to end,
  // and it would do it silently — the quote would come back plausible and wrong.
  const incomplete = lines
    .filter(
      (l) =>
        !l.weight ||
        l.weight <= 0 ||
        !l.length ||
        l.length <= 0 ||
        !l.width ||
        l.width <= 0 ||
        !l.height ||
        l.height <= 0,
    )
    .map((l) => l.sku);

  if (incomplete.length > 0) {
    return { ok: false, reason: 'missing-dimensions', skus: incomplete };
  }

  let weight = 0;
  let length = 0;
  let width = 0;
  let height = 0;

  for (const line of lines) {
    // Fractional quantities exist in this schema (`qty` is numeric), and half a
    // bumper still ships in a whole box: round up for the stack.
    const qty = Math.max(1, Math.ceil(line.qty));
    const [long, mid, thin] = [line.length!, line.width!, line.height!].sort(
      (a, b) => b - a,
    );

    weight += qty * line.weight!;
    length = Math.max(length, long);
    width = Math.max(width, mid);
    height += qty * thin;
  }

  return {
    ok: true,
    parcel: {
      weight: round3(weight),
      length: ceil(length),
      width: ceil(width),
      height: ceil(height),
    },
  };
}
