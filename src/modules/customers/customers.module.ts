import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerBranchService } from './application/services/customer-branch.service';
import { CustomerProfileService } from './application/services/customer-profile.service';
import { CustomerBranchEntity } from './domain/entities/customer-branch.entity';
import { CustomerProfileEntity } from './domain/entities/customer-profile.entity';
import { CustomerController } from './infrastructure/http/customer.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerProfileEntity, CustomerBranchEntity]),
  ],
  providers: [CustomerProfileService, CustomerBranchService],
  controllers: [CustomerController],
  // Entities and the TypeORM repository are NOT exported (D8); only the
  // service methods `orders`/`sales`/`billing`/`quotes` need in-process.
  exports: [CustomerProfileService, CustomerBranchService],
})
export class CustomersModule {}
