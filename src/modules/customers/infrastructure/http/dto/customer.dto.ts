import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../../../../shared/common/pagination/pagination.dto';

/**
 * `ownerSalesRepId` is deliberately NOT declared here (D7). The global
 * `ValidationPipe` runs with `whitelist + forbidNonWhitelisted`, so a caller
 * sending it in the body gets a 400 rather than having it silently stripped
 * — a stripping bug would otherwise be a silent privilege escalation.
 * Ownership is stamped from the JWT in `CustomerProfileService.create` and
 * changed only via `PATCH /v1/customers/:id/owner` (`customers:admin`).
 */
export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  displayName!: string;

  /** Present for a caller who already has an auth identity; absent for a prospect. */
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  authCustomerId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  legalName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  rfc?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerType?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * Code of an existing `commerce.price_lists` row. Absent or null means the
   * customer has no negotiated list and prices off the default one.
   *
   * Assigning a code that does not exist is rejected at write time rather
   * than discovered on the customer's next order.
   */
  @ApiPropertyOptional({ nullable: true })
  @IsString()
  @IsOptional()
  priceListCode?: string | null;
}

/**
 * Editing commercial fields plus deactivation. `authCustomerId` (link-only,
 * see `LinkCustomerDto`) and `ownerSalesRepId` (admin-only, see
 * `ReassignCustomerOwnerDto`) are intentionally excluded — each has its own
 * guarded route rather than being smuggled through a general update.
 */
/**
 * `ownerSalesRepId` and `authCustomerId` are both excluded, but by different
 * mechanisms, and the difference is what used to leak.
 *
 * `ownerSalesRepId` is never declared on `CreateCustomerDto` (D7), so
 * `whitelist + forbidNonWhitelisted` rejects it on its own. `authCustomerId`
 * IS declared there, so inheriting the whole shape let `PATCH
 * /v1/customers/:id` re-point an already-linked profile at another UUID — the
 * exact re-link `POST :id/link` guards with `canLink()`, reached through a
 * second door that called no guard and orphaned the orders, quotes and
 * billing joins. `OmitType` drops it from the inherited shape so the pipe
 * answers 400 for both.
 */
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['authCustomerId'] as const),
) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CustomerQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Admin-only narrowing; a rep is always scoped to itself.',
  })
  @IsUUID()
  @IsOptional()
  ownerSalesRepId?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class LinkCustomerDto {
  @ApiProperty()
  @IsUUID()
  authCustomerId!: string;
}

export class ReassignCustomerOwnerDto {
  @ApiProperty()
  @IsUUID()
  ownerSalesRepId!: string;
}

export class CreateCustomerBranchDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  branchName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  contactPerson?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  recipientName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  company?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  street1?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  areaLevel1?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  areaLevel2?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  areaLevel3?: string;

  @ApiPropertyOptional({ default: 'MX' })
  @IsString()
  @IsOptional()
  countryCode?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isMainBranch?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateCustomerBranchDto extends PartialType(
  CreateCustomerBranchDto,
) {}
