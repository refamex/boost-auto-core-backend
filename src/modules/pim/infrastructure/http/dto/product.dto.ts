import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';
import { PaginationDto } from '../../../../../shared/common/pagination/pagination.dto';

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  brandId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  providerId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  autoPartTypeId?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  providerSku?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  classificationByRotation?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  warrantyPeriod?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isVisible?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  principalImage?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  price?: number;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Free text on sku or name' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  brandId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  autoPartTypeId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  providerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isVisible?: boolean;
}

// -------- Product Dimension --------
export class UpsertProductDimensionDto {
  @ApiProperty()
  @IsNumber()
  width!: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  length?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  height?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  weight?: number;
}

// -------- Product Color --------
export class CreateProductColorDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;
}

// -------- Product Image --------
export class CreateProductImageDto {
  @ApiProperty()
  @IsUrl({ require_tld: false })
  url!: string;
}

// -------- Product Cross-Reference --------
export class CreateCrossReferenceDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  productBrand?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceSku?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceBrand?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  referenceProductSku?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  providerSku?: string;
}
