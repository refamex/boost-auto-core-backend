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
import { PaymentMethodService } from '../../application/services/payment-method.service';
import { CreatePaymentMethodDto, UpdatePaymentMethodDto } from './dto/commerce.dto';

@ApiTags('commerce — payment methods')
@ApiBearerAuth()
@Controller({ path: 'payment-methods', version: '1' })
export class PaymentMethodController {
  constructor(private readonly svc: PaymentMethodService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('commerce:write')
  create(@Body() dto: CreatePaymentMethodDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('commerce:write')
  update(@Param('id') id: string, @Body() dto: UpdatePaymentMethodDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('commerce:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
