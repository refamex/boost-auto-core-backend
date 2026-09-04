export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export interface PresignedUpload {
  /** URL the browser PUTs the bytes to. Short-lived. */
  uploadUrl: string;
  /** Where the object will be readable once the PUT succeeds. */
  publicUrl: string;
  key: string;
  expiresInSeconds: number;
}

export interface PresignInput {
  key: string;
  contentType: string;
  contentLength: number;
}

export interface ObjectStorageClient {
  presignUpload(input: PresignInput): Promise<PresignedUpload>;
}
