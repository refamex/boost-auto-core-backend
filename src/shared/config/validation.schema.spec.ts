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
