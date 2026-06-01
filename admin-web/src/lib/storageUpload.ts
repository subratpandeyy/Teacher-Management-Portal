import { supabase } from './supabase';
import {
  resolveStorageBucket,
  sanitizeStorageFileName,
  STORAGE_BUCKETS,
  type StorageBucket,
} from '../../../shared/storage';
import { UPLOAD_LOG } from '../../../shared/upload';

export type UploadFileResult =
  | {
      ok: true;
      bucket: StorageBucket;
      storagePath: string;
      signedUrl: string | null;
    }
  | { ok: false; error: string };

export type UploadFileOptions = {
  bucket: StorageBucket;
  /** Object path inside the bucket (not a table name). */
  path: string;
  file: File;
  contentType?: string;
};

/**
 * Upload via Supabase Storage API only — never insert into storage.objects manually.
 */
export async function uploadFile(opts: UploadFileOptions): Promise<UploadFileResult> {
  const contentType = opts.contentType ?? opts.file.type ?? 'application/octet-stream';

  console.log(UPLOAD_LOG, 'uploading to storage', {
    bucket: opts.bucket,
    path: opts.path,
    fileName: opts.file.name,
    size: opts.file.size,
  });

  const { error: uploadError } = await supabase.storage.from(opts.bucket).upload(opts.path, opts.file, {
    contentType,
    upsert: false,
  });

  if (uploadError) {
    console.error(UPLOAD_LOG, 'upload failed', uploadError.message);
    return { ok: false, error: uploadError.message };
  }

  console.log(UPLOAD_LOG, 'storage upload success', opts.path);

  const { data: signed, error: signError } = await supabase.storage
    .from(opts.bucket)
    .createSignedUrl(opts.path, 3600);

  if (signError) {
    console.warn(UPLOAD_LOG, 'signed URL failed', signError.message);
    return {
      ok: true,
      bucket: opts.bucket,
      storagePath: opts.path,
      signedUrl: null,
    };
  }

  return {
    ok: true,
    bucket: opts.bucket,
    storagePath: opts.path,
    signedUrl: signed.signedUrl,
  };
}

export async function removeStorageFile(bucket: StorageBucket, storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    console.warn('[storage] remove failed:', bucket, storagePath, error.message);
  }
}

export async function createSignedStorageUrl(
  storagePath: string,
  defaultBucket: StorageBucket = STORAGE_BUCKETS.documents,
  expiresIn = 3600
) {
  const bucket = resolveStorageBucket(storagePath, defaultBucket);
  return supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
}

export { sanitizeStorageFileName, STORAGE_BUCKETS, resolveStorageBucket };
