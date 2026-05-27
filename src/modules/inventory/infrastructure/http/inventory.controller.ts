import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../../shared/common/decorators/current-user.decorator';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { AdjustStockUseCase } from '../../application/use-cases/adjust-stock.use-case';
import { ReleaseStockUseCase } from '../../application/use-cases/release-stock.use-case';
import { ReserveStockUseCase } from '../../application/use-cases/reserve-stock.use-case';
import {
  CreateStockUseCase,
  GetStockByIdUseCase,
} from '../../application/use-cases/create-stock.use-case';
import { ListStockUseCase, SummaryBySkuUseCase } from '../../application/use-cases/read-stock.use-case';
import {
  AdjustStockDto,
  CreateInventoryDto,
  InventoryQueryDto,
  ReleaseStockDto,
  ReserveStockDto,
} from './dto/inventory.dto';
import { InventoryListItem } from '../../application/ports/inventory.repository';
import { Inventory } from '../../domain/inventory.aggregate';

@ApiTags('inventory')
@ApiBearerAuth()
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(
    private readonly listStock: ListStockUseCase,
    private readonly getStockById: GetStockByIdUseCase,
    private readonly createStock: CreateStockUseCase,
    private readonly summaryBySku: SummaryBySkuUseCase,
    private readonly reserveStock: ReserveStockUseCase,
    private readonly releaseStock: ReleaseStockUseCase,
    private readonly adjustStock: AdjustStockUseCase,
  ) {}

  @Get()
  @Roles('inventory:read')
  list(@Query() query: InventoryQueryDto) {
    return this.listStock.execute({
      productSku: query.sku,
      providerBranchId: query.branchId,
      lowStockThreshold: query.lowStockThreshold,
    });
  }

  @Get('by-sku/:sku')
  @Roles('inventory:read')
  summary(@Param('sku') sku: string) {
    return this.summaryBySku.execute(sku);
  }

  @Get(':id')
  @Roles('inventory:read')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.getStockById.execute(id);
  }

  @Post()
  @Roles('inventory:write')
  create(@Body() dto: CreateInventoryDto) {
    return this.createStock.execute(dto);
  }

  @Post(':id/reserve')
  @Roles('inventory:write')
  async reserve(@Param('id', ParseIntPipe) id: number, @Body() dto: ReserveStockDto) {
    const inv = await this.reserveStock.execute(id, dto.qty);
    return this.toView(inv);
  }

  @Post(':id/release')
  @Roles('inventory:write')
  async release(@Param('id', ParseIntPipe) id: number, @Body() dto: ReleaseStockDto) {
    const inv = await this.releaseStock.execute(id, dto.qty);
    return this.toView(inv);
  }

  @Post(':id/adjust')
  @Roles('inventory:write')
  async adjust(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AdjustStockDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const inv = await this.adjustStock.execute(id, dto.delta, dto.reason, user?.id);
    return this.toView(inv);
  }

  private toView(inv: Inventory) {
    const snap = inv.toSnapshot();
    return this.listItemView({
      id: snap.id,
      productSku: snap.productSku,
      providerSku: snap.providerSku,
      providerBranchId: snap.providerBranchId,
      stock: snap.stock,
      reservedStock: snap.reservedStock,
      available: inv.available,
      updatedAt: new Date(),
    });
  }

  private listItemView(item: InventoryListItem) {
    return {
      id: item.id,
      productSku: item.productSku,
      providerSku: item.providerSku,
      providerBranchId: item.providerBranchId,
      stock: item.stock,
      reservedStock: item.reservedStock,
      available: item.available,
      updatedAt: item.updatedAt,
    };
  }
}
