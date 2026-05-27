import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../../shared/common/decorators/roles.decorator';
import { CompatibilityService } from '../../application/services/compatibility.service';
import {
  CompatibilityQueryDto,
  CreateCompatibilityDto,
} from './dto/compatibility.dto';

@ApiTags('compatibility')
@ApiBearerAuth()
@Controller({ path: 'compatibilities', version: '1' })
export class CompatibilityController {
  constructor(private readonly svc: CompatibilityService) {}

  @Get()
  list(@Query() query: CompatibilityQueryDto) {
    return this.svc.list(query);
  }

  @Get(':id')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @Roles('compatibility:write')
  create(@Body() dto: CreateCompatibilityDto) {
    return this.svc.create(dto);
  }

  @Delete(':id')
  @Roles('compatibility:write')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
