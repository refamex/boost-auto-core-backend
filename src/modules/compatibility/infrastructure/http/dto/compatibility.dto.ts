import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CompatibilityQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  modelCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  yearCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assemblyPlantCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  motorizationCode?: string;
}

export class CreateCompatibilityDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  assemblyPlantCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  modelCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  yearCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  motorizationCode!: string;
}
