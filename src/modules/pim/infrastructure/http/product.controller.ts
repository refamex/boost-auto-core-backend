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
import { ProductService } from '../../application/services/product.service';
import {
  CreateCrossReferenceDto,
  CreateProductColorDto,
  CreateProductDto,
  CreateProductImageDto,
  ProductQueryDto,
  UpdateProductDto,
  UpsertProductDimensionDto,
  VehicleProductQueryDto,
} from './dto/product.dto';
import {
  ProductColorService,
  ProductCrossReferenceService,
  ProductDimensionService,
  ProductImageService,
} from '../../application/services/product-children.service';

@ApiTags('pim — products')
@ApiBearerAuth()
@Controller({ path: 'products', version: '1' })
export class ProductController {
  constructor(
    private readonly products: ProductService,
    private readonly colors: ProductColorService,
    private readonly images: ProductImageService,
    private readonly dimensions: ProductDimensionService,
    private readonly crossRefs: ProductCrossReferenceService,
  ) {}

  @Get()
  search(@Query() query: ProductQueryDto) {
    return this.products.search(query);
  }

  @Get('by-vehicle')
  findByVehicle(@Query() query: VehicleProductQueryDto) {
    return this.products.findProductsByVehicle(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.products.findById(id);
  }

  @Get('by-sku/:sku')
  findBySku(@Param('sku') sku: string) {
    return this.products.findBySku(sku);
  }

  @Post()
  @Roles('pim:write')
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @Roles('pim:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @Roles('pim:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.products.remove(id);
  }

  // -------- sub-resources --------

  @Get(':id/colors')
  listColors(@Param('id', ParseIntPipe) id: number) {
    return this.colors.listByProduct(id);
  }

  @Post(':id/colors')
  @Roles('pim:write')
  createColor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductColorDto,
  ) {
    return this.colors.create(id, dto);
  }

  @Delete('colors/:colorId')
  @Roles('pim:write')
  @HttpCode(204)
  async removeColor(@Param('colorId', ParseIntPipe) colorId: number) {
    await this.colors.remove(colorId);
  }

  @Get('by-sku/:sku/images')
  listImages(@Param('sku') sku: string) {
    return this.images.listBySku(sku);
  }

  @Post('by-sku/:sku/images')
  @Roles('pim:write')
  addImage(@Param('sku') sku: string, @Body() dto: CreateProductImageDto) {
    return this.images.create(sku, dto);
  }

  @Delete('images/:imageId')
  @Roles('pim:write')
  @HttpCode(204)
  async removeImage(@Param('imageId') imageId: string) {
    await this.images.remove(imageId);
  }

  @Get('by-sku/:sku/dimensions')
  getDimensions(@Param('sku') sku: string) {
    return this.dimensions.findBySku(sku);
  }

  @Post('by-sku/:sku/dimensions')
  @Roles('pim:write')
  upsertDimensions(
    @Param('sku') sku: string,
    @Body() dto: UpsertProductDimensionDto,
  ) {
    return this.dimensions.upsertBySku(sku, dto);
  }

  @Get('by-sku/:sku/cross-references')
  listCrossRefs(@Param('sku') sku: string) {
    return this.crossRefs.listBySku(sku);
  }

  @Post('by-sku/:sku/cross-references')
  @Roles('pim:write')
  createCrossRef(
    @Param('sku') sku: string,
    @Body() dto: CreateCrossReferenceDto,
  ) {
    return this.crossRefs.create(sku, dto);
  }

  @Delete('cross-references/:refId')
  @Roles('pim:write')
  @HttpCode(204)
  async removeCrossRef(@Param('refId') refId: string) {
    await this.crossRefs.remove(refId);
  }
}
