import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssemblyPlantService } from './application/services/assembly-plant.service';
import { ModelCarMotorizationService } from './application/services/model-car-motorization.service';
import { ModelCarService } from './application/services/model-car.service';
import { MotorizationCarService } from './application/services/motorization-car.service';
import { YearCarService } from './application/services/year-car.service';
import { AssemblyPlantEntity } from './domain/entities/assembly-plant.entity';
import { ModelCarMotorizationEntity } from './domain/entities/model-car-motorization.entity';
import { ModelCarEntity } from './domain/entities/model-car.entity';
import { MotorizationCarEntity } from './domain/entities/motorization-car.entity';
import { YearCarEntity } from './domain/entities/year-car.entity';
import { AssemblyPlantController } from './infrastructure/http/assembly-plant.controller';
import { ModelCarMotorizationController } from './infrastructure/http/model-car-motorization.controller';
import { ModelCarController } from './infrastructure/http/model-car.controller';
import { MotorizationCarController } from './infrastructure/http/motorization-car.controller';
import { YearCarController } from './infrastructure/http/year-car.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssemblyPlantEntity,
      ModelCarEntity,
      YearCarEntity,
      MotorizationCarEntity,
      ModelCarMotorizationEntity,
    ]),
  ],
  providers: [
    AssemblyPlantService,
    ModelCarService,
    YearCarService,
    MotorizationCarService,
    ModelCarMotorizationService,
  ],
  controllers: [
    AssemblyPlantController,
    ModelCarController,
    YearCarController,
    MotorizationCarController,
    ModelCarMotorizationController,
  ],
  exports: [
    AssemblyPlantService,
    ModelCarService,
    YearCarService,
    MotorizationCarService,
  ],
})
export class VehiclesModule {}
