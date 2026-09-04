import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
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
   * The price the caller BELIEVES applies — an assertion to verify, never the
   * price charged. The server resolves the real one from the price list (or
   * `pim.product.price`) and rejects the order with 409 if this disagrees by
   * more than a cent, so a stale cart is told to refresh instead of being
   * silently charged an amount it never displayed.
   *
   * Optional, and safe to stop sending.
   */
  @ApiPropertyOptional({
    description:
      'Client-asserted unit price. Verified against the server price; a mismatch is rejected with 409. Never used to compute totals.',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  unitPrice?: number;

  /**
   * @deprecated Accepted and IGNORED. Tax is computed server-side from
   * `TAX_RATE`. Still accepted only because the global ValidationPipe runs
   * `forbidNonWhitelisted`, so removing the field would 400 every checkout from
   * a storefront that has not deployed yet. Delete once no client sends it.
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

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  salesRepId?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  providerBranchId?: number;

  @ApiPropertyOptional({ default: 'draft' })
  @IsString()
  @IsOptional()
  status?: string;

  /**
   * Staff may name a list. Omitted (and any customer-tier body) resolves from
   * the document customer's profile, then the default list, then catalogue.
   */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  priceListCode?: string;

  /**
   * Contact for this order. Frozen at creation so webhooks and scheduled jobs —
   * which run with no user context — still know who to notify. `shipToEmail`
   * falls back to the caller's JWT `email` claim when omitted.
   */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  shipToName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  shipToPhone?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  shipToEmail?: string;

  /**
   * The destination itself.
   *
   * These columns have existed since `AddShippingSchema` and NO HTTP route
   * could write them: the DTO exposed only name/phone/email, and
   * `forbidNonWhitelisted` turned any attempt to send a street into a 400. The
   * address lived in the browser's localStorage instead, so a customer who
   * changed device lost it and the label could never be generated.
   *
   * All optional, because `createInternal` (a quote converted to an order)
   * carries no address and must not start failing.
   */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  shipToCompany?: string;

  @ApiPropertyOptional({ description: 'Calle y número.' })
  @IsString()
  @IsOptional()
  shipToStreet1?: string;

  @ApiPropertyOptional({
    description: 'Código postal. Decide tarifa y cobertura.',
  })
  @IsString()
  @IsOptional()
  shipToPostalCode?: string;

  @ApiPropertyOptional({ description: 'Estado (Skydropx: areaLevel1).' })
  @IsString()
  @IsOptional()
  shipToAreaLevel1?: string;

  @ApiPropertyOptional({ description: 'Municipio (Skydropx: areaLevel2).' })
  @IsString()
  @IsOptional()
  shipToAreaLevel2?: string;

  @ApiPropertyOptional({ description: 'Colonia (Skydropx: areaLevel3).' })
  @IsString()
  @IsOptional()
  shipToAreaLevel3?: string;

  @ApiPropertyOptional({ default: 'MX' })
  @IsString()
  @IsOptional()
  shipToCountryCode?: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

export class UpdateOrderDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  paymentStatus?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  shippingStatus?: string;
}

export class CreateOrderPaymentDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  paymentMethodId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  amount!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  transactionRef?: string;
}

export class OrderQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;
}

export class PreviewOrderItemDto {
  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  qty!: number;
}

/**
 * A cart to price, not an order to create.
 *
 * Deliberately without `unitPrice`: this endpoint answers what will be charged,
 * so there is nothing for the caller to assert. `CreateOrderItemDto.unitPrice`
 * stays what it is — an assertion verified with a 409 — and the two must not be
 * confused.
 */
export class PreviewOrderDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  /** Same semantics as `CreateOrderDto.priceListCode`, so both price alike. */
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  priceListCode?: string;

  @ApiProperty({ type: [PreviewOrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreviewOrderItemDto)
  items!: PreviewOrderItemDto[];
}
