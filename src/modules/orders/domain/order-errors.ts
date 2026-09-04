import { DomainError } from '../../../shared/common/errors/domain.error';

/**
 * The customer has not finished setting up their account.
 *
 * WHAT THIS CLOSES: registration created an `auth.users` row and nothing else,
 * so an approved shopper could buy with no name, no RFC and no fiscal data on
 * file. The invoice then became somebody's problem after the money had moved.
 *
 * WHY 409 AND NOT 403: a 403 reads as permanent — "you may not" — and this is a
 * state the customer clears themselves in two minutes. 422 is already this
 * codebase's answer for "I cannot compute that" (see `shipping-errors.ts`), and
 * reusing it would blur two failures whose next steps are nothing alike.
 * Conflict is literally what this is: the request disagrees with the current
 * state of the account, and the account is the part that changes.
 *
 * WHY `missing` IS EMPTY FROM HERE: core does not own the field catalogue —
 * auth does, and `GET /auth/me` reports it as `profileStatus.missing`. Copying
 * the list into this service would be a second definition, free to drift from
 * the one the form is actually built from. The frontend switches on `code` and
 * asks auth what is missing.
 */
export class ProfileIncompleteError extends DomainError {
  readonly code = 'CUSTOMER_PROFILE_INCOMPLETE';
  readonly httpStatus = 409;

  constructor(readonly missing: string[] = []) {
    super(
      'Your customer profile is incomplete. Fill in your contact and tax details before placing an order.',
    );
  }
}
