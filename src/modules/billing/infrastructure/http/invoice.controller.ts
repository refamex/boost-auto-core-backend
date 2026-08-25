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
import {
  CreateInvoiceDocumentDto,
  CreateInvoiceDto,
  InvoiceQueryDto,
  UpdateInvoiceDto,
} from './dto/billing.dto';

@ApiTags('billing')
@ApiBearerAuth()
@Controller({ path: 'invoices', version: '1' })
export class InvoiceController {
  constructor(private readonly svc: InvoiceService) {}

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
