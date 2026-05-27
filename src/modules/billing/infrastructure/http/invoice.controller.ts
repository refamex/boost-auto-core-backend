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
  list(@Query() query: InvoiceQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
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
  listDocuments(@Param('id') id: string) {
    return this.svc.listDocuments(id);
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
