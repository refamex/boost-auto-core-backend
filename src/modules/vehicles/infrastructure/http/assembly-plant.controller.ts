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
import { AssemblyPlantService } from '../../application/services/assembly-plant.service';
import { CreateAssemblyPlantDto, UpdateAssemblyPlantDto } from './dto/vehicles.dto';

@ApiTags('vehicles — assembly plants')
@ApiBearerAuth()
@Controller({ path: 'assembly-plants', version: '1' })
export class AssemblyPlantController {
  constructor(private readonly svc: AssemblyPlantService) {}

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
  create(@Body() dto: CreateAssemblyPlantDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('vehicles:write')
  update(@Param('id') id: string, @Body() dto: UpdateAssemblyPlantDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('vehicles:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
