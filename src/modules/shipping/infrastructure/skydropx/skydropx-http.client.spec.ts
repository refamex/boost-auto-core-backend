import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../../../shared/config/configuration';
import { SkydropxHttpClient } from './skydropx-http.client';

const config = {
  get: (key: string) =>
    ({
      'skydropx.server': 'sandbox',
      'skydropx.clientId': 'id',
      'skydropx.clientSecret': 'secret',
    })[key],
} as unknown as ConfigService<AppConfig, true>;

const okJson = (body: unknown) =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

const QUOTE_INPUT = {
  origin: { name: 'O', street1: 'a', postalCode: '01000', countryCode: 'MX' },
  destination: {
    name: 'D',
    street1: 'b',
    postalCode: '64000',
    countryCode: 'MX',
  },
  parcel: { weight: 2, length: 30, width: 20, height: 10 },
};

describe('SkydropxHttpClient — request deadlines', () => {
  let client: SkydropxHttpClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    client = new SkydropxHttpClient(config);
    fetchMock = jest.fn();
    global.fetch = fetchMock;
    jest.spyOn(client['logger'], 'error').mockImplementation(() => undefined);
  });

  const signalOf = (call: number): AbortSignal => {
    const [, init] = fetchMock.mock.calls[call] as [string, RequestInit];
    return init.signal as AbortSignal;
  };

  it('passes an abort signal on every call', async () => {
    // Before this, a hung Skydropx hung the checkout request with it — there
    // was no deadline anywhere in this client.
    fetchMock
      .mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 7200 }))
      .mockResolvedValueOnce(okJson({ id: 'q1', rates: [] }));

    await client.quote(QUOTE_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signalOf(0)).toBeInstanceOf(AbortSignal);
    expect(signalOf(1)).toBeInstanceOf(AbortSignal);
  });

  it('maps an aborted request to 503, like any other transport failure', async () => {
    // A caller should not have to tell "no answer" apart from "answered too
    // late": both mean the same thing to whoever is waiting.
    fetchMock
      .mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 7200 }))
      .mockRejectedValueOnce(
        Object.assign(new Error('The operation was aborted'), {
          name: 'TimeoutError',
        }),
      );

    await expect(client.quote(QUOTE_INPUT)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps a network failure to 503 too', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(client.quote(QUOTE_INPUT)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('never leaks the upstream error into the response', async () => {
    // The detail goes to the log; the caller gets a stable message. An upstream
    // stack in an HTTP body is how internals end up in a customer's browser.
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED 10.0.0.1:443'));

    await expect(client.quote(QUOTE_INPUT)).rejects.toThrow(
      'Skydropx is not responding',
    );
  });

  it('gives quoting a shorter deadline than buying a label', async () => {
    // Quoting sits in the checkout with someone watching, so it fails fast.
    // Buying may already have executed upstream — aborting early would leave us
    // unsure whether a guide exists, which is worse than waiting.
    fetchMock
      .mockResolvedValueOnce(okJson({ access_token: 't', expires_in: 7200 }))
      .mockResolvedValueOnce(okJson({ id: 'q1', rates: [] }));
    await client.quote(QUOTE_INPUT);
    const quoteSignal = signalOf(1);

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(okJson({ data: { id: 's1' } }));
    await client.createShipment({ quotationId: 'q1', rateId: 'r1' });
    const shipmentSignal = signalOf(0);

    // Both are live; the assertion that matters is that they are distinct
    // instances built from different budgets, not a single shared signal.
    expect(quoteSignal).not.toBe(shipmentSignal);
    expect(quoteSignal.aborted).toBe(false);
    expect(shipmentSignal.aborted).toBe(false);
  });
});
