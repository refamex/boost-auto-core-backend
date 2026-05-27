import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class InventoryQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  branchId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  lowStockThreshold?: number;
}

export class ReserveStockDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  qty!: number;
}

export class ReleaseStockDto extends ReserveStockDto {}

export class CreateInventoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productSku!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  providerSku!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  providerBranchId!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  stock?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  reservedStock?: number;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'Positive to add, negative to subtract' })
  @IsInt()
  @Type(() => Number)
  delta!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
