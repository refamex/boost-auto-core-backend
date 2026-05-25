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
import { BrandCategoryService } from '../../application/services/brand-category.service';
import { CreateBrandCategoryDto } from './dto/taxonomies.dto';

@ApiTags('pim — brand-categories')
@ApiBearerAuth()
@Controller({ path: 'brand-categories', version: '1' })
export class BrandCategoryController {
  constructor(private readonly svc: BrandCategoryService) {}

  @Get()
  list(@Query('brandCode') brandCode?: string, @Query('categoryCode') categoryCode?: string) {
    return this.svc.list(brandCode, categoryCode);
  }

  @Post()
  @Roles('pim:write')
  create(@Body() dto: CreateBrandCategoryDto) {
    return this.svc.create(dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
