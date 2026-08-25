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
import { VolumeCategoryService } from '../../application/services/volume-category.service';
import {
  CreateVolumeCategoryDto,
  UpdateVolumeCategoryDto,
} from './dto/taxonomies.dto';

@ApiTags('pim — volume-categories')
@ApiBearerAuth()
@Controller({ path: 'volume-categories', version: '1' })
export class VolumeCategoryController {
  constructor(private readonly svc: VolumeCategoryService) {}

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
  create(@Body() dto: CreateVolumeCategoryDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('pim:write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateVolumeCategoryDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
