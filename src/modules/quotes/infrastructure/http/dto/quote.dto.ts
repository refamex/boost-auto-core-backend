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
  Max,
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
   * Negotiated unit price, overriding the customer's price list for this line.
   *
   * The list price is still resolved and stored in `list_price_snapshot`, so
   * what was given away stays visible after the fact.
   */
  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  unitPrice?: number;

  /**
   * Percentage off the list price for this line. Mutually exclusive with
   * `unitPrice` — sending both would mean deciding which one wins, and either
   * answer silently contradicts the caller.
   */
  @ApiPropertyOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  discountPct?: number;

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
  /**
   * The customer's AUTH identity. Only usable for a customer who already has a
   * platform account, which is why it is no longer required: a rep quoting
   * someone they just met has no way to know this value.
   *
   * Exactly one of `customerId` / `customerProfileId` must be sent —
   * `QuoteService.create` rejects both-or-neither. Prefer `customerProfileId`:
   * it works for prospects too, and it is what a customer picker can offer.
   */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  customerId?: string;

  /**
   * A row in `customers.customer_profile` — the rep's own portfolio. Works
   * whether or not that customer has signed up: if they have, the account is
   * resolved from the profile; if not, the quote waits for `link()`.
   */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  customerProfileId?: string;

  /** Staff override. Omitted resolves from the quote customer's profile, then default, then catalogue. */
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
