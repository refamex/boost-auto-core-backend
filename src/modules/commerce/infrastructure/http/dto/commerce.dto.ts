import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreatePriceListDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customerType?: string;

  @ApiPropertyOptional({ default: 'MXN' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

export class UpdatePriceListDto extends PartialType(CreatePriceListDto) {}

export class CreatePriceListItemDto {
  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  productId!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  price!: number;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  minQty?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validTo?: string;
}

export class UpdatePriceListItemDto extends PartialType(CreatePriceListItemDto) {}

export class CreatePaymentMethodDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  provider?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePaymentMethodDto extends PartialType(CreatePaymentMethodDto) {}
