import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSaleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sourceType!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  orderId?: string;

  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  subtotal?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  discountTotal?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  taxTotal?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  grandTotal?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  paymentStatus?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  saleStatus?: string;
}

export class UpdateSaleDto extends PartialType(CreateSaleDto) {}

export class SaleQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  orderId?: string;
}
