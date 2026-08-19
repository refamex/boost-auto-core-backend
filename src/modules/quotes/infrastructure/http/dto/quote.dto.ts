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
   * Absolute tax amount for the line, matching CreateOrderItemDto. There is no
   * tax-rate concept in this service, so the caller supplies the amount.
   */
  @ApiPropertyOptional({ default: 0 })
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
