import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
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

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  unitPrice!: number;

  @ApiPropertyOptional({ default: 0 })
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
