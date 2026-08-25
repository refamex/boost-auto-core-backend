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
import { CategoryService } from '../../application/services/category.service';
import {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/taxonomies.dto';

@ApiTags('pim — categories')
@ApiBearerAuth()
@Controller({ path: 'categories', version: '1' })
export class CategoryController {
  constructor(private readonly svc: CategoryService) {}

  @Get()
  list(@Query() query: CategoryQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('pim:write')
  create(@Body() dto: CreateCategoryDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('pim:write')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
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
