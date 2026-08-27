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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { BrandService } from '../../application/services/brand.service';
import {
  BrandQueryDto,
  CreateBrandDto,
  UpdateBrandDto,
} from './dto/taxonomies.dto';

@ApiTags('pim — brands')
@ApiBearerAuth()
@Controller({ path: 'brands', version: '1' })
export class BrandController {
  constructor(private readonly svc: BrandService) {}

  @Get()
  list(@Query() query: BrandQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Get('by-code/:code')
  findByCode(@Param('code') code: string) {
    return this.svc.findByCode(code);
  }

  @Post()
  @Roles('pim:write')
  create(@Body() dto: CreateBrandDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('pim:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBrandDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
