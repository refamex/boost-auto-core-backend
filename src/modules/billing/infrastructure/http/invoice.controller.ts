import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { CurrentUser } from '../../../../shared/common/decorators/current-user.decorator';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { InvoiceService } from '../../application/services/invoice.service';
import { StampingService } from '../../application/services/stamping.service';
import {
  CancelInvoiceDto,
  CreateInvoiceDocumentDto,
  CreateInvoiceDto,
  InvoiceQueryDto,
  UpdateInvoiceDto,
} from './dto/billing.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller({ path: 'invoices', version: '1' })
export class InvoiceController {
  constructor(
    private readonly svc: InvoiceService,
    private readonly stamping: StampingService,
  ) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: InvoiceQueryDto,
  ) {
    return this.svc.list(user, query);
  }

  @Get(':id')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.findById(id, user);
  }

  @Post()
  @Roles('billing:write')
  create(@Body() dto: CreateInvoiceDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('billing:write')
  update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('billing:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  /**
   * Timbra la factura ante el SAT.
   *
   * Hoy responde 503 con el motivo: no hay PAC contratado. Es deliberado — un
   * UUID inventado se guarda, se imprime y se le entrega a alguien que cree
   * tener una factura valida.
   */
  @Post(':id/stamp')
  @Roles('billing:write')
  @HttpCode(200)
  stamp(@Param('id') id: string) {
    return this.stamping.stamp(id);
  }

  @Post(':id/cancel')
  @Roles('billing:write')
  @HttpCode(200)
  cancel(@Param('id') id: string, @Body() dto: CancelInvoiceDto) {
    return this.stamping.cancel(id, dto);
  }

  @Get(':id/documents')
  listDocuments(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.listDocuments(id, user);
  }

  @Post(':id/documents')
  @Roles('billing:write')
  addDocument(@Param('id') id: string, @Body() dto: CreateInvoiceDocumentDto) {
    return this.svc.addDocument(id, dto);
  }

  @Delete('documents/:documentId')
  @Roles('billing:write')
  @HttpCode(204)
  async removeDocument(@Param('documentId') documentId: string) {
    await this.svc.removeDocument(documentId);
  }
}
