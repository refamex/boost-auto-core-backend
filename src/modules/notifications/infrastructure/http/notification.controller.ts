import {
  Controller,
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
import { NotificationService } from '../../application/services/notification.service';
import { NotificationQueryDto } from './dto/notification.dto';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'notifications', version: '1' })
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  @Get()
  @Roles('notifications:read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: NotificationQueryDto,
  ) {
    return this.svc.list(user.id, query);
  }

  // Declared before any `:id` route — Nest matches in declaration order, so a
  // bare `@Get(':id')` above this would swallow `unread-count`.
  @Get('unread-count')
  @Roles('notifications:read')
  async unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return { unread: await this.svc.unreadCount(user.id) };
  }

  @Post('read-all')
  @Roles('notifications:read')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.markAllRead(user.id);
  }

  @Patch(':id/read')
  @Roles('notifications:read')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.svc.markRead(id, user.id);
  }
}
