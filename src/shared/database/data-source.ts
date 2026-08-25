import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';

loadEnv();

const isTs = __filename.endsWith('.ts');

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'postgres',
  database: process.env.DB_NAME ?? 'autoboost-core',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  migrationsRun: false,
  entities: [isTs ? 'src/**/*.entity.ts' : 'dist/**/*.entity.js'],
  migrations: [
    isTs
      ? 'src/shared/database/migrations/*.ts'
      : 'dist/shared/database/migrations/*.js',
  ],
  logging:
    process.env.NODE_ENV === 'development'
      ? ['error', 'warn', 'schema']
      : ['error'],
};

export const AppDataSource = new DataSource(dataSourceOptions);
