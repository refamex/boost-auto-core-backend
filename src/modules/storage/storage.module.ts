import { Module } from '@nestjs/common';
import { OBJECT_STORAGE } from './application/ports/object-storage.client';
import { UploadService } from './application/services/upload.service';
import { StorageController } from './infrastructure/http/storage.controller';
import { S3StorageClient } from './infrastructure/s3/s3-storage.client';

/**
 * Subida directa a S3 mediante URL prefirmada.
 *
 * LOS BYTES NO PASAN POR ESTE SERVICIO, y esa es la decision de diseno. Evita
 * `multer` acá, y evita tocar el proxy del admin, que lee el cuerpo como texto
 * y fuerza `Content-Type: application/json` — un multipart no sobreviviria ese
 * salto. Los endpoints que ya existen (`POST /v1/products/by-sku/:sku/images`
 * con `{ url }`) no cambian en absoluto.
 */
@Module({
  providers: [
    { provide: OBJECT_STORAGE, useClass: S3StorageClient },
    UploadService,
  ],
  controllers: [StorageController],
  exports: [UploadService],
})
export class StorageModule {}
