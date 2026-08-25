import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAssemblyPlantDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  assemblyPlant?: string;
}

export class UpdateAssemblyPlantDto extends PartialType(
  CreateAssemblyPlantDto,
) {}

export class CreateModelCarDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  codeModel?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  modelCar?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  codeAssemblyPlant?: string;
}

export class UpdateModelCarDto extends PartialType(CreateModelCarDto) {}

export class CreateYearCarDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  year?: string;
}

export class UpdateYearCarDto extends PartialType(CreateYearCarDto) {}

export class CreateMotorizationCarDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  motorization?: string;
}

export class UpdateMotorizationCarDto extends PartialType(
  CreateMotorizationCarDto,
) {}

export class CreateModelCarMotorizationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  modelCarCode!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  motorizationCode!: string;
}
