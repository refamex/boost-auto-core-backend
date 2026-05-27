import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { PolarCheckoutService } from '../../application/services/polar-checkout.service';

@ApiTags('payments — polar checkout')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrderPolarCheckoutController {
  constructor(private readonly polarCheckout: PolarCheckoutService) {}

  @Post(':orderId/polar-checkout')
  @Roles('payments:write')
  create(@Param('orderId') orderId: string) {
    return this.polarCheckout.createForOrder(orderId);
  }

  @Get(':orderId/polar-checkout')
  latest(@Param('orderId') orderId: string) {
    return this.polarCheckout.findLatestByOrder(orderId);
  }
}
