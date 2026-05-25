import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { BrandProviderService } from '../../application/services/brand-provider.service';
import { CreateBrandProviderDto } from './dto/supplier.dto';

@ApiTags('suppliers — brand-providers')
@ApiBearerAuth()
@Controller({ version: '1' })
export class BrandProviderController {
  constructor(private readonly svc: BrandProviderService) {}

  @Get('brands/:brandId/providers')
  listByBrand(@Param('brandId', ParseIntPipe) brandId: number) {
    return this.svc.listByBrand(brandId);
  }

  @Get('providers/:providerId/brands')
  listByProvider(@Param('providerId', ParseIntPipe) providerId: number) {
    return this.svc.listByProvider(providerId);
  }

  @Post('brand-providers')
  @Roles('suppliers:write')
  create(@Body() dto: CreateBrandProviderDto) {
    return this.svc.create(dto);
  }

  @Delete('brand-providers/:id')
  @Roles('suppliers:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
