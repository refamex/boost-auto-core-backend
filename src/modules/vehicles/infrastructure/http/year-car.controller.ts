import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { YearCarService } from '../../application/services/year-car.service';
import { CreateYearCarDto, UpdateYearCarDto } from './dto/vehicles.dto';

@ApiTags('vehicles — years')
@ApiBearerAuth()
@Controller({ path: 'year-cars', version: '1' })
export class YearCarController {
  constructor(private readonly svc: YearCarService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.svc.findByCode(code);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('vehicles:write')
  create(@Body() dto: CreateYearCarDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('vehicles:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateYearCarDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('vehicles:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
