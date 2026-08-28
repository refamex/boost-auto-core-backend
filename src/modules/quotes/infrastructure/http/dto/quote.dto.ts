import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinDate,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../../../shared/common/pagination/pagination.dto';

export class CreateQuoteItemDto {
  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  qty!: number;

  /**
   * @deprecated Accepted and IGNORED, matching CreateOrderItemDto. Tax is
   * computed server-side from `TAX_RATE`. Still accepted only because the
   * global ValidationPipe runs `forbidNonWhitelisted`, so removing the field
   * would 400 callers that have not stopped sending it yet.
   */
  @ApiPropertyOptional({
    deprecated: true,
    description: 'Ignored. Tax is computed server-side.',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  tax?: number;
}

export class CreateQuoteDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  /** Which price list to price against. Falls back to the default list. */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  priceListCode?: string;

  /**
   * Mandatory: a quote without an explicit validity is not a quote.
   *
   * The lazy MinDate overload is required — `@MinDate(new Date())` would
   * evaluate once at module load and validate against the moment the process
   * started rather than the moment of the request.
   */
  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), { message: 'validUntil must be in the future' })
  validUntil!: Date;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({ type: [CreateQuoteItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateQuoteItemDto)
  items!: CreateQuoteItemDto[];
}

/**
 * Editing is draft-only. The customer cannot be swapped — that is a different
 * quote, not an edit of this one.
 */
export class UpdateQuoteDto extends PartialType(
  OmitType(CreateQuoteDto, ['customerId'] as const),
) {}

export class QuoteQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional({
    enum: ['draft', 'sent', 'approved', 'rejected', 'converted', 'expired'],
  })
  @IsString()
  @IsOptional()
  status?: string;
}
