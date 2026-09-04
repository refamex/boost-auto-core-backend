import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { CurrentUser } from '../../../../shared/common/decorators/current-user.decorator';
import { UploadService } from '../../application/services/upload.service';
import { RequestUploadDto } from './dto/upload.dto';

@ApiTags('storage')
@ApiBearerAuth()
@Controller({ path: 'storage', version: '1' })
export class StorageController {
  constructor(private readonly uploads: UploadService) {}

  /**
   * Sin `@Roles(...)` en la ruta: el permiso depende del proposito y lo decide
   * `UploadService`. Un decorador unico tendria que nombrar el mas laxo de los
   * dos, y eso le daria a quien edita productos una firma para escribir
   * documentos fiscales.
   */
  @Post('uploads')
  @ApiOperation({
    summary: 'Firma una subida directa a S3 (los bytes no pasan por este servicio)',
  })
  requestUpload(
    @Body() dto: RequestUploadDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.uploads.requestUpload(dto, user);
  }
}
