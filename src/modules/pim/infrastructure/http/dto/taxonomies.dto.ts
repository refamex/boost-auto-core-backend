import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationDto } from '../../../../../shared/common/pagination/pagination.dto';

// -------- Category --------
export class CreateCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  idDepartment!: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}

export class CategoryQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  departmentCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}

// -------- Brand --------
export class CreateBrandDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandCode?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  image?: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateBrandDto extends PartialType(CreateBrandDto) {}

export class BrandQueryDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return undefined;
  })
  @IsBoolean()
  isActive?: boolean;
}

// -------- AutoPart --------
export class CreateAutoPartDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  volumeCategoryId?: number;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  categoryId?: number;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateAutoPartDto extends PartialType(CreateAutoPartDto) {}

// -------- VolumeCategory --------
export class CreateVolumeCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  weight?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  height?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  width?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  length?: number;
}

export class UpdateVolumeCategoryDto extends PartialType(
  CreateVolumeCategoryDto,
) {}

// -------- BrandCategory --------
export class CreateBrandCategoryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  brandCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  categoryCode!: string;

  @ApiPropertyOptional({ default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// -------- CategoryComplement --------
export class CreateCategoryComplementDto {
  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  categoryIndexId!: number;

  @ApiProperty()
  @IsInt()
  @Type(() => Number)
  categoryComplementId!: number;
}
