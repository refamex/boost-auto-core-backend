import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateApiClientDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateApiClientDto extends PartialType(CreateApiClientDto) {}

export class CreateImportJobDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  jobType!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  sourceSystem?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  status!: string;
}

export class UpdateImportJobDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  startedAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  finishedAt?: Date;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  recordsReceived?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  recordsProcessed?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  recordsFailed?: number;
}

export class CreateImportJobLogDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  level?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional()
  @IsObject()
  @IsOptional()
  payloadJson?: Record<string, unknown>;
}

export class ImportJobQueryDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  jobType?: string;
}
