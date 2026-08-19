import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import {
  RoughCountryStockSyncService,
  StockSyncRunResult,
} from '../../application/services/rough-country-stock-sync.service';

@ApiTags('stock-sync')
@ApiBearerAuth()
@Controller({ path: 'stock-sync', version: '1' })
export class StockSyncController {
  constructor(
    private readonly roughCountrySync: RoughCountryStockSyncService,
  ) {}

  @Post('rough-country/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @Roles('inventory:write')
  @ApiOperation({
    summary: 'Run the Rough Country stock import now',
    description:
      'Runs the same import the 11:00/15:00 (America/Mexico_City) schedule triggers. ' +
      'Returns "skipped" when the integration is disabled or another run holds the lock.',
  })
  run(): Promise<StockSyncRunResult> {
    return this.roughCountrySync.run();
  }
}
