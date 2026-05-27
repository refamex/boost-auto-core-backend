import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { ShipmentService } from '../../application/services/shipment.service';
import { ShippingQuoteService } from '../../application/services/shipping-quote.service';
import { CreateShipmentDto, QuoteShipmentDto } from './dto/shipping.dto';

@ApiTags('shipping — skydropx')
@ApiBearerAuth()
@Controller({ version: '1' })
export class ShippingController {
  constructor(
    private readonly quoteService: ShippingQuoteService,
    private readonly shipmentService: ShipmentService,
  ) {}

  @Post('orders/:orderId/shipping/quotes')
  @Roles('shipping:write')
  quote(@Param('orderId') orderId: string, @Body() dto: QuoteShipmentDto) {
    return this.quoteService.quoteForOrder(orderId, dto);
  }

  @Post('orders/:orderId/shipping/shipments')
  @Roles('shipping:write')
  createShipment(@Param('orderId') orderId: string, @Body() dto: CreateShipmentDto) {
    return this.shipmentService.createForOrder(orderId, dto.quotationId, dto.rateId);
  }

  @Get('orders/:orderId/shipping/shipment')
  @Roles('shipping:read')
  byOrder(@Param('orderId') orderId: string) {
    return this.shipmentService.findByOrder(orderId);
  }

  @Post('shipping/shipments/:id/cancel')
  @Roles('shipping:write')
  cancel(@Param('id') id: string) {
    return this.shipmentService.cancel(id);
  }

  @Get('shipping/shipments/:id/tracking')
  @Roles('shipping:read')
  tracking(@Param('id') id: string) {
    return this.shipmentService.getTracking(id);
  }
}
