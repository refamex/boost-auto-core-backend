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
});
