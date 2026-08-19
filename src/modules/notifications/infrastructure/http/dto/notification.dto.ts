import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../../../shared/common/pagination/pagination.dto';

export class NotificationQueryDto extends PaginationDto {
  /**
   * Boolean query params do not convert cleanly with this project's
   * class-transformer setup, so the string form is handled explicitly —
   * a known pitfall documented in CLAUDE.md.
   */
  @ApiPropertyOptional({ default: false })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  unreadOnly?: boolean = false;
}
