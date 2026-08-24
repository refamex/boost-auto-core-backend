import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { JwtStrategy } from './jwt.strategy';

type JwtConfig = AppConfig['jwt'];

// Pure `new JwtStrategy(fakeConfig)` — no Nest bootstrap. `ConfigService.get`
// is only ever called as `config.get('jwt', { infer: true })`, so a fake that
// ignores its arguments and returns the fixture is a faithful stand-in.
const config = (jwt: JwtConfig): ConfigService<AppConfig, true> =>
  ({ get: () => jwt }) as unknown as ConfigService<AppConfig, true>;

const base = { issuer: 'autoboost-auth', audience: 'autoboost-core' };

type StrategyInternals = {
  _verifOpts: { algorithms: string[] };
  _secretOrKeyProvider: (
    req: unknown,
    rawJwtToken: unknown,
    done: (err: unknown, secretOrKey?: unknown) => void,
  ) => void;
};

describe('JwtStrategy — buildStrategyOptions (RS256-only, D6/D9 trap)', () => {
  it.each<[string, JwtConfig]>([
    [
      'jwks',
      {
        ...base,
        mode: 'jwks',
        jwksUrl: 'https://auth.example.com/.well-known/jwks.json',
      },
    ],
    [
      'static',
      { ...base, mode: 'static', publicKey: '-----BEGIN PUBLIC KEY-----' },
    ],
    ['mock', { ...base, mode: 'mock' }],
  ])('restricts algorithms to RS256 on the %s branch', (_label, jwt) => {
    const strategy = new JwtStrategy(
      config(jwt),
    ) as unknown as StrategyInternals;

    expect(strategy._verifOpts.algorithms).toEqual(['RS256']);
  });

  it('throws at construction when JWT_MODE=static has no public key', () => {
    expect(() => new JwtStrategy(config({ ...base, mode: 'static' }))).toThrow(
      /JWT_PUBLIC_KEY/,
    );
  });

  it('throws at construction when JWT_MODE=jwks has no JWKS url', () => {
    expect(() => new JwtStrategy(config({ ...base, mode: 'jwks' }))).toThrow(
      /JWT_JWKS_URL/,
    );
  });

  it('builds successfully in mock mode with no key material, and its provider fails closed', () => {
    const strategy = new JwtStrategy(
      config({ ...base, mode: 'mock' }),
    ) as unknown as StrategyInternals;
    const done = jest.fn();

    strategy._secretOrKeyProvider(null, 'raw-token', done);

    expect(done).toHaveBeenCalledTimes(1);
    const [err, secretOrKey] = done.mock.calls[0] as [unknown, unknown];
    expect(err).toBeInstanceOf(Error);
    expect(secretOrKey).toBeUndefined();
  });
});
