import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompatibilityService } from './application/services/compatibility.service';
import { CompatibilityEntity } from './domain/entities/compatibility.entity';
import { CompatibilityController } from './infrastructure/http/compatibility.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CompatibilityEntity])],
  providers: [CompatibilityService],
  controllers: [CompatibilityController],
  exports: [CompatibilityService],
})
export class CompatibilityModule {}
