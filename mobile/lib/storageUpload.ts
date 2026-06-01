import { File } from 'expo-file-system';
import { supabase } from './supabase';
import {
  resolveStorageBucket,
  sanitizeStorageFileName,
  STORAGE_BUCKETS,
  type StorageBucket,
} from './storageBuckets';

export type LocalFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

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
  path: string;
  fileUri: string;
  fileName: string;
  contentType?: string;
};

async function readFileBytesFromUri(
  uri: string
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return { ok: false, error: 'Selected file is not readable. Try choosing the file again.' };
    }
    const bytes = await file.bytes();
    if (bytes.byteLength === 0) {
      return { ok: false, error: 'Selected file is empty.' };
    }
    return { ok: true, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file';
    return { ok: false, error: message };
  }
}

/**
 * Upload via Supabase Storage API only — never insert into storage.objects manually.
 */
export async function uploadFile(opts: UploadFileOptions): Promise<UploadFileResult> {
  const readResult = await readFileBytesFromUri(opts.fileUri);
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }

  const contentType = opts.contentType ?? 'application/octet-stream';

  const { error: uploadError } = await supabase.storage
    .from(opts.bucket)
    .upload(opts.path, readResult.bytes, {
      contentType,
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: uploadError.message };
  }

  const { data: signed, error: signError } = await supabase.storage
    .from(opts.bucket)
    .createSignedUrl(opts.path, 3600);

  return {
    ok: true,
    bucket: opts.bucket,
    storagePath: opts.path,
    signedUrl: signError ? null : signed.signedUrl,
  };
}

/** @deprecated Use uploadFile({ bucket, path, fileUri, fileName }) */
export async function uploadFileToStorage(
  storagePath: string,
  file: LocalFile,
  bucket: StorageBucket = STORAGE_BUCKETS.chatFiles
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await uploadFile({
    bucket,
    path: storagePath,
    fileUri: file.uri,
    fileName: file.name,
    contentType: file.mimeType,
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true };
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
