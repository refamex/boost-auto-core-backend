import {
  ForbiddenException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthenticatedUser } from '../../../../shared/auth/jwt-payload.interface';
import { expand } from '../../../../shared/auth/role-permissions';
import { buildObjectKey, checkUpload } from '../../domain/upload-purpose';
import {
  OBJECT_STORAGE,
  ObjectStorageClient,
  PresignedUpload,
} from '../ports/object-storage.client';

export interface RequestUploadInput {
  purpose: string;
  contentType: string;
  size: number;
}

@Injectable()
export class UploadService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorageClient,
  ) {}

  /**
   * Signs one upload of one exact object.
   *
   * The permission is checked HERE rather than with a single `@Roles(...)` on
   * the route, because it depends on the purpose: catalogue photography needs
   * `pim:write` and an invoice XML needs `billing:write`. One decorator would
   * have to name the looser of the two, which would hand whoever can edit
   * products a signature to write fiscal documents.
   *
   * Each failure keeps its own status. "That file is too big" and "we do not
   * accept that format" send a person to two different actions, and a single
   * 400 sends them to neither.
   */
  async requestUpload(
    input: RequestUploadInput,
    user: AuthenticatedUser,
  ): Promise<PresignedUpload> {
    const check = checkUpload(input);

    if (!check.ok) {
      const { rejection } = check;
      if (rejection.reason === 'unknown-purpose') {
        throw new UnsupportedMediaTypeException(
          `Unknown upload purpose "${input.purpose}"`,
        );
      }
      if (rejection.reason === 'content-type') {
        throw new UnsupportedMediaTypeException(
          `${input.contentType} is not accepted here. Allowed: ${rejection.allowed.join(', ')}`,
        );
      }
      throw new PayloadTooLargeException(
        `The file exceeds the ${Math.round(rejection.maxBytes / (1024 * 1024))} MB limit for this kind of upload`,
      );
    }

    const granted = expand(user.roles);
    if (!granted.has(check.rule.permission)) {
      throw new ForbiddenException(
        `${check.rule.permission} is required to upload this kind of file`,
      );
    }

    return this.storage.presignUpload({
      key: buildObjectKey(
        check.rule,
        input.contentType,
        randomUUID(),
        new Date(),
      ),
      contentType: input.contentType.split(';')[0].trim().toLowerCase(),
      contentLength: input.size,
    });
  }
}
