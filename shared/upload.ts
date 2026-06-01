/** Shared upload logging prefix and result shape (mobile + admin-web). */
export const UPLOAD_LOG = '[upload]';

export type StorageUploadSuccess = {
  ok: true;
  bucket: string;
  storagePath: string;
  signedUrl: string | null;
};

export type StorageUploadFailure = {
  ok: false;
  error: string;
};

export type StorageUploadResult = StorageUploadSuccess | StorageUploadFailure;
