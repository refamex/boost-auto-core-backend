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
import { ImportJobService } from '../../application/services/import-job.service';
import {
  CreateImportJobDto,
  CreateImportJobLogDto,
  ImportJobQueryDto,
  UpdateImportJobDto,
} from './dto/integrations.dto';

@ApiTags('integrations — import jobs')
@ApiBearerAuth()
@Controller({ path: 'import-jobs', version: '1' })
export class ImportJobController {
  constructor(private readonly svc: ImportJobService) {}

  @Get()
  list(@Query() query: ImportJobQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('integrations:write')
  create(@Body() dto: CreateImportJobDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @Roles('integrations:write')
  update(@Param('id') id: string, @Body() dto: UpdateImportJobDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('integrations:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }

  @Get(':id/logs')
  listLogs(@Param('id') id: string) {
    return this.svc.listLogs(id);
  }

  @Post(':id/logs')
  @Roles('integrations:write')
  addLog(@Param('id') id: string, @Body() dto: CreateImportJobLogDto) {
    return this.svc.addLog(id, dto);
  }
}
