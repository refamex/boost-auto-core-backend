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
import { AutoPartService } from '../../application/services/auto-part.service';
import { CreateAutoPartDto, UpdateAutoPartDto } from './dto/taxonomies.dto';

@ApiTags('pim — autoparts')
@ApiBearerAuth()
@Controller({ path: 'autoparts', version: '1' })
export class AutoPartController {
  constructor(private readonly svc: AutoPartService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('pim:write')
  create(@Body() dto: CreateAutoPartDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('pim:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAutoPartDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
