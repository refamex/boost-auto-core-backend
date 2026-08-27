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
import { QuoteService } from '../../application/services/quote.service';
import { CreateQuoteDto, QuoteQueryDto, UpdateQuoteDto } from './dto/quote.dto';

@ApiTags('quotes')
@ApiBearerAuth()
@Controller({ path: 'quotes', version: '1' })
export class QuoteController {
  constructor(private readonly svc: QuoteService) {}

  @Get()
  @Roles('quotes:read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: QuoteQueryDto) {
    return this.svc.list(user, query);
  }

  /**
   * Customer-facing reads, declared before every `:id` route below because
   * Nest matches in declaration order — `:id` first would swallow `me`.
   *
   * Deliberately ungated, mirroring `InvoiceController`: the macro role
   * `customer` grants neither `quotes:read` nor anything else quotes-related,
   * so `@Roles('quotes:read')` on the staff routes above 403s a customer
   * before ownership is ever evaluated. Granting `quotes:read` to `customer`
   * instead would ALSO open the unfiltered staff route, which is the thing
   * these two routes exist to avoid.
   *
   * No extra scoping lives here: `QuoteService` already narrows a caller who
   * is neither admin nor rep to their own quotes, and only once sent
   * (`quote-visibility.ts::buildWhere`).
   */
  @Get('me')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QuoteQueryDto,
  ) {
    return this.svc.list(user, query);
  }

  @Get('me/:id')
  findMineById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.svc.findById(id, user);
  }

  @Post()
  @Roles('quotes:write')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateQuoteDto) {
    return this.svc.create(user, dto);
  }

  // Action routes are declared before the bare `:id` routes: Nest matches in
  // declaration order.
  @Post(':id/send')
  @Roles('quotes:write')
  send(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.send(id, user);
  }

  @Post(':id/approve')
  @Roles('quotes:write')
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.approve(id, user);
  }

  @Post(':id/reject')
  @Roles('quotes:write')
  reject(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.reject(id, user);
  }

  @Post(':id/convert')
  @Roles('quotes:write')
  convert(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.convert(id, user);
  }

  @Get(':id')
  @Roles('quotes:read')
  findById(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.findById(id, user);
  }

  @Patch(':id')
  @Roles('quotes:write')
  update(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateQuoteDto,
  ) {
    return this.svc.update(id, user, dto);
  }

  @Delete(':id')
  @Roles('quotes:write')
  @HttpCode(204)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.svc.remove(id, user);
  }
}
