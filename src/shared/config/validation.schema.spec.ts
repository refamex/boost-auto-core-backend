import { validationSchema } from './validation.schema';

const baseEnv = {
  DB_HOST: 'localhost',
  DB_NAME: 'autoboost-core',
  DB_USER: 'postgres',
  DB_PASS: 'postgres',
};

describe('validationSchema — JWT_MODE vs NODE_ENV (D9)', () => {
  it('rejects JWT_MODE=mock when NODE_ENV=production', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      JWT_MODE: 'mock',
    });

    expect(error?.message).toContain('JWT_MODE');
  });

  it('accepts NODE_ENV=production with JWT_MODE=jwks and a JWKS URL', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      JWT_MODE: 'jwks',
      JWT_JWKS_URL: 'https://auth.example.com/.well-known/jwks.json',
    });

    expect(error).toBeUndefined();
  });

  it('accepts NODE_ENV=production with JWT_MODE=static and a public key', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      NODE_ENV: 'production',
      JWT_MODE: 'static',
      JWT_PUBLIC_KEY: '-----BEGIN PUBLIC KEY-----',
    });

    expect(error).toBeUndefined();
  });

  it('leaves the development default (NODE_ENV=development, JWT_MODE=mock) unaffected', () => {
    const { error } = validationSchema.validate(baseEnv);

    expect(error).toBeUndefined();
  });
});

describe('validationSchema — TAX_RATE', () => {
  /** Joi types `value` as `any`; narrow it once instead of casting per call. */
  const rateOf = (env: Record<string, string>): unknown =>
    (validationSchema.validate(env).value as Record<string, unknown>).TAX_RATE;

  it('defaults to 16% when unset', () => {
    const { error } = validationSchema.validate(baseEnv);

    expect(error).toBeUndefined();
    expect(rateOf(baseEnv)).toBe(0.16);
  });

  it('accepts a fraction inside [0, 1]', () => {
    expect(rateOf({ ...baseEnv, TAX_RATE: '0.08' })).toBe(0.08);
    expect(rateOf({ ...baseEnv, TAX_RATE: '0' })).toBe(0);
  });

  it('refuses a percent, which would tax an order 1600x over', () => {
    const { error } = validationSchema.validate({ ...baseEnv, TAX_RATE: '16' });

    expect(error?.message).toContain('TAX_RATE');
  });

  it('refuses a negative rate', () => {
    const { error } = validationSchema.validate({
      ...baseEnv,
      TAX_RATE: '-0.1',
    });

    expect(error?.message).toContain('TAX_RATE');
  });
});
