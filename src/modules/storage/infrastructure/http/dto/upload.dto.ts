import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive, IsString } from 'class-validator';
import { UPLOAD_PURPOSES } from '../../../domain/upload-purpose';

/**
 * No hay campo `key` ni `filename` a proposito.
 *
 * La clave la arma el servidor entera. Un nombre que llega del navegador es un
 * lugar donde escribir: `../../algo`, o simplemente la clave de la imagen de
 * otro producto. El cliente declara QUE va a subir, nunca DONDE.
 */
export class RequestUploadDto {
  @ApiProperty({ enum: UPLOAD_PURPOSES })
  @IsString()
  purpose!: string;

  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  contentType!: string;

  @ApiProperty({ description: 'Tamano en bytes. Se firma junto con la URL.' })
  @IsInt()
  @IsPositive()
  size!: number;
}
