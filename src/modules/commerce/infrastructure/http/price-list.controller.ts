import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { PriceListItemService } from '../../application/services/price-list-item.service';
import { PriceListService } from '../../application/services/price-list.service';
import {
  CreatePriceListDto,
  CreatePriceListItemDto,
  UpdatePriceListDto,
  UpdatePriceListItemDto,
} from './dto/commerce.dto';

@ApiTags('commerce — price lists')
@ApiBearerAuth()
@Controller({ path: 'price-lists', version: '1' })
export class PriceListController {
  constructor(
    private readonly priceLists: PriceListService,
    private readonly items: PriceListItemService,
  ) {}

  @Get()
  list() {
    return this.priceLists.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.priceLists.findById(id);
  }

  @Post()
  @Roles('commerce:write')
  create(@Body() dto: CreatePriceListDto) {
    return this.priceLists.create(dto);
  }

  @Patch(':id')
  @Roles('commerce:write')
  update(@Param('id') id: string, @Body() dto: UpdatePriceListDto) {
    return this.priceLists.update(id, dto);
  }

  @Delete(':id')
  @Roles('commerce:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.priceLists.remove(id);
  }

  @Get(':id/items')
  listItems(@Param('id') id: string) {
    return this.items.listByPriceList(id);
  }

  @Post(':id/items')
  @Roles('commerce:write')
  createItem(@Param('id') id: string, @Body() dto: CreatePriceListItemDto) {
    return this.items.create(id, dto);
  }

  @Patch('items/:itemId')
  @Roles('commerce:write')
  updateItem(
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePriceListItemDto,
  ) {
    return this.items.update(itemId, dto);
  }

  @Delete('items/:itemId')
  @Roles('commerce:write')
  @HttpCode(204)
  async removeItem(@Param('itemId') itemId: string) {
    await this.items.remove(itemId);
  }
}
