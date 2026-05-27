import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

class QuoteAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() street1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() postalCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaLevel1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaLevel2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() areaLevel3?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
}

class QuoteParcelDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() weight?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() length?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() width?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() height?: number;
}

/**
 * Override opcional: si el pedido ya tiene destino/parcel cargados, el body
 * puede ir vacío. Sirve para recotizar con otro bulto o dirección.
 */
export class QuoteShipmentDto {
  @ApiPropertyOptional({ type: QuoteAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteAddressDto)
  destination?: QuoteAddressDto;

  @ApiPropertyOptional({ type: QuoteParcelDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuoteParcelDto)
  parcel?: QuoteParcelDto;
}

export class CreateShipmentDto {
  @IsString()
  quotationId!: string;

  @IsString()
  rateId!: string;
}
