/**
 * Mobile storage upload service (Expo SDK 56).
 * Uses expo-file-system File + arrayBuffer() → Supabase Storage.upload(Uint8Array).
 * No copyAsync, readAsStringAsync, uploadAsync, or manual storage.objects inserts.
 */
import { File } from 'expo-file-system';
import { supabase } from './supabase';
import { UPLOAD_LOG } from '../../shared/upload';
import {
  resolveStorageBucket,
  sanitizeStorageFileName,
  STORAGE_BUCKETS,
  type StorageBucket,
} from './storageBuckets';

export type { StorageBucket };

export type UploadFileOptions = {
  bucket: StorageBucket;
  /** Object path inside the bucket — never a bucket name or UUID. */
  path: string;
  file: File;
  fileName: string;
  contentType?: string;
};

export type UploadFileResult =
  | {
      ok: true;
      bucket: StorageBucket;
      storagePath: string;
      signedUrl: string | null;
    }
  | { ok: false; error: string };

/** Read picked file bytes via Expo SDK 56 File.arrayBuffer(). */
export async function readExpoFileBytes(
  file: File
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  if (!file.exists) {
    console.error(UPLOAD_LOG, 'file exists', false, file.uri);
    return { ok: false, error: 'Selected file is not accessible. Try selecting again.' };
  }

  console.log(UPLOAD_LOG, 'file exists', { uri: file.uri, size: file.size, type: file.type });

  try {
    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return { ok: false, error: 'Selected file is empty.' };
    }
    const bytes = new Uint8Array(buffer);
    console.log(UPLOAD_LOG, 'arrayBuffer created', bytes.byteLength);
    return { ok: true, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file';
    console.error(UPLOAD_LOG, 'arrayBuffer failed', message);
    return { ok: false, error: message };
  }
}

export async function uploadFile(opts: UploadFileOptions): Promise<UploadFileResult> {
  console.log(UPLOAD_LOG, 'uploading to storage', {
    bucket: opts.bucket,
    path: opts.path,
    fileName: opts.fileName,
  });

  const readResult = await readExpoFileBytes(opts.file);
  if (!readResult.ok) {
    console.error(UPLOAD_LOG, 'upload failed', readResult.error);
    return { ok: false, error: readResult.error };
  }

  const contentType = opts.contentType ?? opts.file.type ?? 'application/octet-stream';

  const { error: uploadError } = await supabase.storage
    .from(opts.bucket)
    .upload(opts.path, readResult.bytes, {
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
  }

  return {
    ok: true,
    bucket: opts.bucket,
    storagePath: opts.path,
    signedUrl: signError ? null : signed.signedUrl,
  };
}

export async function removeStorageFile(bucket: StorageBucket, storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([storagePath]);
  if (error) {
    console.warn(UPLOAD_LOG, 'remove failed', bucket, storagePath, error.message);
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
