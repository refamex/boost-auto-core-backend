import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfig } from '../../../../shared/config/configuration';
import {
  ObjectStorageClient,
  PresignedUpload,
  PresignInput,
} from '../../application/ports/object-storage.client';

/**
 * The signature is short-lived on purpose: it is a capability to write one
 * exact key, and it should stop being one soon after the upload dialog closes.
 * Five minutes covers a slow connection on a 10 MB photo without leaving a
 * usable write token in a browser history for the rest of the day.
 */
const SIGNATURE_TTL_SECONDS = 300;

@Injectable()
export class S3StorageClient implements ObjectStorageClient {
  private client?: S3Client;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Built lazily so the service still boots with storage disabled.
   *
   * Local development has no AWS credentials, and refusing to start over a
   * feature nobody is exercising would make every developer configure a bucket
   * to work on the catalogue.
   */
  private s3(): S3Client {
    const storage = this.config.get('storage', { infer: true });
    if (!storage.enabled) {
      throw new ServiceUnavailableException(
        'File uploads are not enabled (STORAGE_ENABLED=false)',
      );
    }
    this.client ??= new S3Client({
      region: storage.region,
      credentials: {
        accessKeyId: storage.accessKeyId,
        secretAccessKey: storage.secretAccessKey,
      },
    });
    return this.client;
  }

  async presignUpload(input: PresignInput): Promise<PresignedUpload> {
    const storage = this.config.get('storage', { infer: true });
    const client = this.s3();

    // `ContentType` and `ContentLength` are part of what gets SIGNED, so the
    // browser cannot swap a 200 KB jpeg signature for a 2 GB upload of
    // something else: S3 rejects a PUT whose headers do not match.
    const command = new PutObjectCommand({
      Bucket: storage.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: SIGNATURE_TTL_SECONDS,
    });

    return {
      uploadUrl,
      publicUrl: `${storage.publicBaseUrl.replace(/\/+$/, '')}/${input.key}`,
      key: input.key,
      expiresInSeconds: SIGNATURE_TTL_SECONDS,
    };
  }
}
