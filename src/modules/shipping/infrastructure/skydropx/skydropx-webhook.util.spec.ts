import {
  isValidSkydropxWebhookToken,
  SKYDROPX_AUTH_HEADER,
} from './skydropx-webhook.util';

const TOKEN = 'sky-webhook-token-123';

describe('isValidSkydropxWebhookToken', () => {
  it('reads the token from the Authorization header', () => {
    expect(SKYDROPX_AUTH_HEADER).toBe('authorization');
  });

  it('accepts the bare token configured in the Skydropx panel', () => {
    expect(isValidSkydropxWebhookToken(TOKEN, TOKEN)).toBe(true);
  });

  it('accepts the token behind a Bearer scheme', () => {
    expect(isValidSkydropxWebhookToken(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it('accepts the token behind a Token scheme, case-insensitively', () => {
    expect(isValidSkydropxWebhookToken(`token ${TOKEN}`, TOKEN)).toBe(true);
  });

  // The panel field may itself have been filled in with the scheme included,
  // so normalising only the incoming header would still reject a valid call.
  it('accepts a bare header when the configured value carries the scheme', () => {
    expect(isValidSkydropxWebhookToken(TOKEN, `Bearer ${TOKEN}`)).toBe(true);
  });

  it('tolerates surrounding whitespace on the header', () => {
    expect(isValidSkydropxWebhookToken(`  ${TOKEN}  `, TOKEN)).toBe(true);
  });

  it('rejects a missing header', () => {
    expect(isValidSkydropxWebhookToken(undefined, TOKEN)).toBe(false);
  });

  it('rejects an empty header', () => {
    expect(isValidSkydropxWebhookToken('', TOKEN)).toBe(false);
  });

  it('rejects a different token of the same length', () => {
    expect(isValidSkydropxWebhookToken('sky-webhook-token-999', TOKEN)).toBe(
      false,
    );
  });

  it('rejects a token that is only a prefix of the expected one', () => {
    expect(isValidSkydropxWebhookToken('sky-webhook', TOKEN)).toBe(false);
  });

  it('rejects any header when no token is configured', () => {
    expect(isValidSkydropxWebhookToken(TOKEN, '')).toBe(false);
  });
});
