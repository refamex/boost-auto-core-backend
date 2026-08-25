import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { CurrentUser } from '../../../../shared/common/decorators/current-user.decorator';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { OrderService } from '../../application/services/order.service';
import {
  CreateOrderDto,
  CreateOrderPaymentDto,
  OrderQueryDto,
  UpdateOrderDto,
} from './dto/order.dto';

@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrderController {
  constructor(private readonly svc: OrderService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: OrderQueryDto) {
    return this.svc.list(user, query);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.findById(id, user);
  }

  @Post()
  @Roles('orders:create', 'orders:write')
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(dto, user);
  }

  @Patch(':id')
  @Roles('orders:write')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/confirm')
  @Roles('orders:write')
  confirm(@Param('id') id: string) {
    return this.svc.confirm(id);
  }

  @Post(':id/prepare')
  @Roles('orders:write')
  prepare(@Param('id') id: string) {
    return this.svc.prepare(id);
  }

  @Post(':id/cancel')
  @Roles('orders:write')
  cancel(@Param('id') id: string) {
    return this.svc.cancel(id);
  }

  @Post(':id/payments')
  @Roles('orders:write')
  addPayment(@Param('id') id: string, @Body() dto: CreateOrderPaymentDto) {
    return this.svc.addPayment(id, dto);
  }
}
