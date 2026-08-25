import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandProviderEntity } from './domain/entities/brand-provider.entity';
import { ProviderBranchEntity } from './domain/entities/provider-branch.entity';
import { ProviderEntity } from './domain/entities/provider.entity';
import { BrandProviderService } from './application/services/brand-provider.service';
import { ProviderBranchService } from './application/services/provider-branch.service';
import { ProviderService } from './application/services/provider.service';
import { BrandProviderController } from './infrastructure/http/brand-provider.controller';
import { ProviderController } from './infrastructure/http/provider.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProviderEntity,
      ProviderBranchEntity,
      BrandProviderEntity,
    ]),
  ],
  providers: [ProviderService, ProviderBranchService, BrandProviderService],
  controllers: [ProviderController, BrandProviderController],
  exports: [ProviderService, ProviderBranchService],
})
export class SuppliersModule {}
