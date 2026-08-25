import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { CategoryComplementService } from '../../application/services/category-complement.service';
import { CreateCategoryComplementDto } from './dto/taxonomies.dto';

@ApiTags('pim — category-complements')
@ApiBearerAuth()
@Controller({ path: 'category-complements', version: '1' })
export class CategoryComplementController {
  constructor(private readonly svc: CategoryComplementService) {}

  @Get()
  list(@Query('categoryIndexId') categoryIndexId?: string) {
    return this.svc.list(
      categoryIndexId ? parseInt(categoryIndexId, 10) : undefined,
    );
  }

  @Post()
  @Roles('pim:write')
  create(@Body() dto: CreateCategoryComplementDto) {
    return this.svc.create(dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
