import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiClientService } from './application/services/api-client.service';
import { ImportJobService } from './application/services/import-job.service';
import { ApiClientEntity } from './domain/entities/api-client.entity';
import { ImportJobLogEntity } from './domain/entities/import-job-log.entity';
import { ImportJobEntity } from './domain/entities/import-job.entity';
import { ApiClientController } from './infrastructure/http/api-client.controller';
import { ImportJobController } from './infrastructure/http/import-job.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ApiClientEntity,
      ImportJobEntity,
      ImportJobLogEntity,
    ]),
  ],
  providers: [ApiClientService, ImportJobService],
  controllers: [ApiClientController, ImportJobController],
  exports: [ApiClientService, ImportJobService],
})
export class IntegrationsModule {}
