import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  PreviewOrderDto,
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

  /**
   * Quién movió esta orden y cuándo.
   *
   * Sin `@Roles`: el scope de propiedad va en el servicio, igual que en
   * `findById`. El historial de una orden no puede ser más visible que la
   * orden misma.
   */
  @Get(':id/status-events')
  statusEvents(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.listStatusEvents(id, user);
  }

  @Post()
  @Roles('orders:create', 'orders:write')
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.create(dto, user);
  }

  /**
   * Qué se cobraría por este carrito, sin crear nada.
   *
   * Mismo `@Roles` que `create` a propósito: quien puede crear la orden puede
   * ver su precio, y nadie más. `200` y no `201` porque no nace ningún recurso.
   */
  @Post('price-preview')
  @HttpCode(HttpStatus.OK)
  @Roles('orders:create', 'orders:write')
  preview(
    @Body() dto: PreviewOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.preview(dto, user);
  }

  @Patch(':id')
  @Roles('orders:write')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/confirm')
  @Roles('orders:write')
  confirm(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.confirm(id, user);
  }

  @Post(':id/prepare')
  @Roles('orders:write')
  prepare(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.prepare(id, user);
  }

  @Post(':id/cancel')
  @Roles('orders:write')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.cancel(id, user);
  }

  @Post(':id/payments')
  @Roles('orders:write')
  addPayment(@Param('id') id: string, @Body() dto: CreateOrderPaymentDto) {
    return this.svc.addPayment(id, dto);
  }
}
