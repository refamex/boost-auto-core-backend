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
import { CategoryDepartmentService } from '../../application/services/category-department.service';
import {
  CreateCategoryDepartmentDto,
  UpdateCategoryDepartmentDto,
} from './dto/category-department.dto';

@ApiTags('pim — departments')
@ApiBearerAuth()
@Controller({ path: 'departments', version: '1' })
export class CategoryDepartmentController {
  constructor(private readonly svc: CategoryDepartmentService) {}

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
  create(@Body() dto: CreateCategoryDepartmentDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('pim:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCategoryDepartmentDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
