import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { ModelCarMotorizationService } from '../../application/services/model-car-motorization.service';
import { CreateModelCarMotorizationDto } from './dto/vehicles.dto';

@ApiTags('vehicles — model motorizations')
@ApiBearerAuth()
@Controller({ path: 'model-car-motorizations', version: '1' })
export class ModelCarMotorizationController {
  constructor(private readonly svc: ModelCarMotorizationService) {}

  @Get()
  list(
    @Query('modelCarCode') modelCarCode?: string,
    @Query('motorizationCode') motorizationCode?: string,
  ) {
    return this.svc.list(modelCarCode, motorizationCode);
  }

  @Post()
  @Roles('vehicles:write')
  create(@Body() dto: CreateModelCarMotorizationDto) {
    return this.svc.create(dto);
  }

  @Delete(':id')
  @Roles('vehicles:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
