import * as Joi from 'joi';

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error').default('info'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASS: Joi.string().required().allow(''),
  DB_SSL: Joi.boolean().default(false),

  JWT_MODE: Joi.string().valid('mock', 'jwks', 'static').default('mock'),
  JWT_JWKS_URL: Joi.string().uri().when('JWT_MODE', { is: 'jwks', then: Joi.required() }),
  JWT_PUBLIC_KEY: Joi.string().when('JWT_MODE', { is: 'static', then: Joi.required() }),
  JWT_ISSUER: Joi.string().default('autoboost-auth'),
  JWT_AUDIENCE: Joi.string().default('autoboost-core'),

  POLAR_ENABLED: Joi.boolean().default(false),
  POLAR_ACCESS_TOKEN: Joi.string().when('POLAR_ENABLED', { is: true, then: Joi.required() }),
  POLAR_WEBHOOK_SECRET: Joi.string().when('POLAR_ENABLED', { is: true, then: Joi.required() }),
  POLAR_SERVER: Joi.string().valid('sandbox', 'production').default('sandbox'),
  POLAR_PRODUCT_ID: Joi.string().when('POLAR_ENABLED', { is: true, then: Joi.required() }),
  POLAR_SUCCESS_URL: Joi.string().uri().when('POLAR_ENABLED', { is: true, then: Joi.required() }),
  POLAR_CANCEL_URL: Joi.string().uri().when('POLAR_ENABLED', { is: true, then: Joi.required() }),
  POLAR_CURRENCY: Joi.string().default('mxn'),

  SKYDROPX_ENABLED: Joi.boolean().default(false),
  SKYDROPX_CLIENT_ID: Joi.string().when('SKYDROPX_ENABLED', { is: true, then: Joi.required() }),
  SKYDROPX_CLIENT_SECRET: Joi.string().when('SKYDROPX_ENABLED', { is: true, then: Joi.required() }),
  SKYDROPX_SERVER: Joi.string().valid('sandbox', 'production').default('sandbox'),
  SKYDROPX_WEBHOOK_SECRET: Joi.string().when('SKYDROPX_ENABLED', {
    is: true,
    then: Joi.required(),
  }),
  SKYDROPX_ORIGIN_NAME: Joi.string().when('SKYDROPX_ENABLED', { is: true, then: Joi.required() }),
  SKYDROPX_ORIGIN_COMPANY: Joi.string().optional(),
  SKYDROPX_ORIGIN_STREET1: Joi.string().when('SKYDROPX_ENABLED', {
    is: true,
    then: Joi.required(),
  }),
  SKYDROPX_ORIGIN_POSTAL_CODE: Joi.string().when('SKYDROPX_ENABLED', {
    is: true,
    then: Joi.required(),
  }),
  SKYDROPX_ORIGIN_AREA_LEVEL1: Joi.string().when('SKYDROPX_ENABLED', {
    is: true,
    then: Joi.required(),
  }),
  SKYDROPX_ORIGIN_AREA_LEVEL2: Joi.string().when('SKYDROPX_ENABLED', {
    is: true,
    then: Joi.required(),
  }),
  SKYDROPX_ORIGIN_AREA_LEVEL3: Joi.string().optional(),
  SKYDROPX_ORIGIN_COUNTRY_CODE: Joi.string().default('MX'),
  SKYDROPX_ORIGIN_PHONE: Joi.string().when('SKYDROPX_ENABLED', { is: true, then: Joi.required() }),
  SKYDROPX_ORIGIN_EMAIL: Joi.string().email().optional(),
});
