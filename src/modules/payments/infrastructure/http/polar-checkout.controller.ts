import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PolarCheckoutService } from '../../application/services/polar-checkout.service';

@ApiTags('payments — polar checkout')
@ApiBearerAuth()
@Controller({ path: 'payments/polar-checkouts', version: '1' })
export class PolarCheckoutController {
  constructor(private readonly polarCheckout: PolarCheckoutService) {}

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.polarCheckout.findById(id);
  }
}
