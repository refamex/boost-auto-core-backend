export type JwtMode = 'mock' | 'jwks' | 'static';

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    pass: string;
    ssl: boolean;
  };
  jwt: {
    mode: JwtMode;
    jwksUrl?: string;
    publicKey?: string;
    issuer: string;
    audience: string;
  };
}

export default (): AppConfig => ({
  env: (process.env.NODE_ENV as AppConfig['env']) ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'autoboost-core',
    user: process.env.DB_USER ?? 'postgres',
    pass: process.env.DB_PASS ?? 'postgres',
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    mode: (process.env.JWT_MODE as JwtMode) ?? 'mock',
    jwksUrl: process.env.JWT_JWKS_URL,
    publicKey: process.env.JWT_PUBLIC_KEY,
    issuer: process.env.JWT_ISSUER ?? 'autoboost-auth',
    audience: process.env.JWT_AUDIENCE ?? 'autoboost-core',
  },
});
