/**
 * Mobile-local copy of teacher-portal/shared/upload.ts
 * (Metro cannot reliably watch parent ../shared in all environments.)
 */
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
