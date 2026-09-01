/** Effective price-list code for a document. Empty/whitespace counts as omitted. */
export function documentPriceListCode(input: {
  honorBodyCode: boolean;
  bodyCode?: string;
  profileCode?: string | null;
}): string | undefined {
  const body = nonempty(input.bodyCode);
  const profile = nonempty(input.profileCode);
  return input.honorBodyCode && body ? body : profile;
}

function nonempty(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
