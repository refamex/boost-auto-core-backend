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
import { ProviderBranchService } from '../../application/services/provider-branch.service';
import { ProviderService } from '../../application/services/provider.service';
import {
  CreateProviderBranchDto,
  CreateProviderDto,
  UpdateProviderBranchDto,
  UpdateProviderDto,
} from './dto/supplier.dto';

@ApiTags('suppliers — providers')
@ApiBearerAuth()
@Controller({ path: 'providers', version: '1' })
export class ProviderController {
  constructor(
    private readonly providers: ProviderService,
    private readonly branches: ProviderBranchService,
  ) {}

  @Get()
  list() {
    return this.providers.list();
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.providers.findById(id);
  }

  @Post()
  @Roles('suppliers:write')
  create(@Body() dto: CreateProviderDto) {
    return this.providers.create(dto);
  }

  @Patch(':id')
  @Roles('suppliers:write')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProviderDto) {
    return this.providers.update(id, dto);
  }

  @Delete(':id')
  @Roles('suppliers:write')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.providers.remove(id);
  }

  // -------- branches --------

  @Get(':id/branches')
  listBranches(@Param('id', ParseIntPipe) providerId: number) {
    return this.branches.listByProvider(providerId);
  }

  @Post(':id/branches')
  @Roles('suppliers:write')
  createBranch(
    @Param('id', ParseIntPipe) providerId: number,
    @Body() dto: CreateProviderBranchDto,
  ) {
    return this.branches.create(providerId, dto);
  }

  @Patch('branches/:branchId')
  @Roles('suppliers:write')
  updateBranch(@Param('branchId') branchId: string, @Body() dto: UpdateProviderBranchDto) {
    return this.branches.update(branchId, dto);
  }

  @Delete('branches/:branchId')
  @Roles('suppliers:write')
  @HttpCode(204)
  async removeBranch(@Param('branchId') branchId: string) {
    await this.branches.remove(branchId);
  }
}
