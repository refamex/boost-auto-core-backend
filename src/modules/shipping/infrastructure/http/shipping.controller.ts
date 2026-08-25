import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { CurrentUser } from '../../../../shared/common/decorators/current-user.decorator';
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

  // F9 — quoting only reads the order and asks a carrier for prices; it buys
  // nothing. `shipping:write` gates the two routes that spend real money.
  @Post('orders/:orderId/shipping/quotes')
  @Roles('shipping:read')
  quote(
    @Param('orderId') orderId: string,
    @Body() dto: QuoteShipmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.quoteService.quoteForOrder(orderId, user, dto);
  }

  @Post('orders/:orderId/shipping/shipments')
  @Roles('shipping:write')
  createShipment(
    @Param('orderId') orderId: string,
    @Body() dto: CreateShipmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shipmentService.createForOrder(
      orderId,
      dto.quotationId,
      dto.rateId,
      user,
    );
  }

  @Get('orders/:orderId/shipping/shipment')
  @Roles('shipping:read')
  byOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.shipmentService.findByOrder(orderId, user);
  }

  // Deliberately NO @CurrentUser: staff-only under F9, so scoping guards
  // nothing reachable and could only break a non-admin operator.
  @Post('shipping/shipments/:id/cancel')
  @Roles('shipping:write')
  cancel(@Param('id') id: string) {
    return this.shipmentService.cancel(id);
  }

  @Get('shipping/shipments/:id/tracking')
  @Roles('shipping:read')
  tracking(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.shipmentService.getTracking(id, user);
  }
}
