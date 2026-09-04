import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateInvoiceDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  orderId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  saleId?: string;

  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  rfc?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  legalName?: string;

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
  taxTotal?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  grandTotal?: number;

  @ApiPropertyOptional({ default: 'MXN' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  satStatus?: string;
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export class CreateInvoiceDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fileUrl!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  checksum?: string;
}

export class InvoiceQueryDto {
  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  customerId?: string;

  @ApiPropertyOptional()
  @IsUUID()
  @IsOptional()
  orderId?: string;
}

/**
 * Cancelacion ante el SAT.
 *
 * `motivo` es la clave del catalogo c_MotivoCancelacion. El SAT no borra
 * comprobantes: los sustituye, y el motivo `01` obliga a decir cual comprobante
 * reemplaza a este.
 */
export class CancelInvoiceDto {
  @ApiProperty({ enum: ['01', '02', '03', '04'] })
  @IsIn(['01', '02', '03', '04'])
  motivo!: '01' | '02' | '03' | '04';

  @ApiPropertyOptional({ description: 'Obligatorio cuando motivo es 01.' })
  @IsOptional()
  @IsUUID()
  uuidSustitucion?: string;
}
