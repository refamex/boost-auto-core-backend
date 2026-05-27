export type JwtMode = 'mock' | 'jwks' | 'static';
export type PolarServer = 'sandbox' | 'production';
export type SkydropxServer = 'sandbox' | 'production';

export interface PolarConfig {
  enabled: boolean;
  accessToken?: string;
  webhookSecret?: string;
  server: PolarServer;
  productId?: string;
  successUrl?: string;
  cancelUrl?: string;
  currency: string;
}

export interface SkydropxOriginAddress {
  name?: string;
  company?: string;
  street1?: string;
  postalCode?: string;
  areaLevel1?: string;
  areaLevel2?: string;
  areaLevel3?: string;
  countryCode: string;
  phone?: string;
  email?: string;
}

export interface SkydropxConfig {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  server: SkydropxServer;
  webhookSecret?: string;
  origin: SkydropxOriginAddress;
}

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
  polar: PolarConfig;
  skydropx: SkydropxConfig;
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
  polar: {
    enabled: process.env.POLAR_ENABLED === 'true',
    accessToken: process.env.POLAR_ACCESS_TOKEN,
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET,
    server: (process.env.POLAR_SERVER === 'production' ? 'production' : 'sandbox') as PolarServer,
    productId: process.env.POLAR_PRODUCT_ID,
    successUrl: process.env.POLAR_SUCCESS_URL,
    cancelUrl: process.env.POLAR_CANCEL_URL,
    currency: (process.env.POLAR_CURRENCY ?? 'mxn').toLowerCase(),
  },
  skydropx: {
    enabled: process.env.SKYDROPX_ENABLED === 'true',
    clientId: process.env.SKYDROPX_CLIENT_ID,
    clientSecret: process.env.SKYDROPX_CLIENT_SECRET,
    server: (process.env.SKYDROPX_SERVER === 'production'
      ? 'production'
      : 'sandbox') as SkydropxServer,
    webhookSecret: process.env.SKYDROPX_WEBHOOK_SECRET,
    origin: {
      name: process.env.SKYDROPX_ORIGIN_NAME,
      company: process.env.SKYDROPX_ORIGIN_COMPANY,
      street1: process.env.SKYDROPX_ORIGIN_STREET1,
      postalCode: process.env.SKYDROPX_ORIGIN_POSTAL_CODE,
      areaLevel1: process.env.SKYDROPX_ORIGIN_AREA_LEVEL1,
      areaLevel2: process.env.SKYDROPX_ORIGIN_AREA_LEVEL2,
      areaLevel3: process.env.SKYDROPX_ORIGIN_AREA_LEVEL3,
      countryCode: process.env.SKYDROPX_ORIGIN_COUNTRY_CODE ?? 'MX',
      phone: process.env.SKYDROPX_ORIGIN_PHONE,
      email: process.env.SKYDROPX_ORIGIN_EMAIL,
    },
  },
});
