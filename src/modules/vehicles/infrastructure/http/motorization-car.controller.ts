import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { MotorizationCarService } from '../../application/services/motorization-car.service';
import {
  CreateMotorizationCarDto,
  UpdateMotorizationCarDto,
} from './dto/vehicles.dto';

@ApiTags('vehicles — motorizations')
@ApiBearerAuth()
@Controller({ path: 'motorizations', version: '1' })
export class MotorizationCarController {
  constructor(private readonly svc: MotorizationCarService) {}

  @Get()
  list() {
    return this.svc.list();
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
  create(@Body() dto: CreateMotorizationCarDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('vehicles:write')
  update(@Param('id') id: string, @Body() dto: UpdateMotorizationCarDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('vehicles:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
