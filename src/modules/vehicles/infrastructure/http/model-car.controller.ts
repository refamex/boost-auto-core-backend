import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { ModelCarService } from '../../application/services/model-car.service';
import { CreateModelCarDto, UpdateModelCarDto } from './dto/vehicles.dto';

@ApiTags('vehicles — models')
@ApiBearerAuth()
@Controller({ path: 'model-cars', version: '1' })
export class ModelCarController {
  constructor(private readonly svc: ModelCarService) {}

  @Get()
  list(@Query('codeAssemblyPlant') codeAssemblyPlant?: string) {
    return this.svc.list(codeAssemblyPlant);
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.svc.findByCode(code);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('vehicles:write')
  create(@Body() dto: CreateModelCarDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('vehicles:write')
  update(@Param('id') id: string, @Body() dto: UpdateModelCarDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('vehicles:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
