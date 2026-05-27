import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { ApiClientService } from '../../application/services/api-client.service';
import { CreateApiClientDto, UpdateApiClientDto } from './dto/integrations.dto';

@ApiTags('integrations — api clients')
@ApiBearerAuth()
@Controller({ path: 'api-clients', version: '1' })
export class ApiClientController {
  constructor(private readonly svc: ApiClientService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('integrations:write')
  create(@Body() dto: CreateApiClientDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('integrations:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateApiClientDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('integrations:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
  }
}
