import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { SaleService } from '../../application/services/sale.service';
import { CreateSaleDto, SaleQueryDto, UpdateSaleDto } from './dto/sale.dto';

@ApiTags('sales')
@ApiBearerAuth()
@Controller({ path: 'sales', version: '1' })
export class SaleController {
  constructor(private readonly svc: SaleService) {}

  @Get()
  list(@Query() query: SaleQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('sales:write')
  create(@Body() dto: CreateSaleDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('sales:write')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('sales:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
