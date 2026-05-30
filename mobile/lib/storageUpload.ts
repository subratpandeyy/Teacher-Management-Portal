import { File } from 'expo-file-system';
import { supabase } from './supabase';

const BUCKET = 'teacher-documents';

export type LocalFile = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
};

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'document';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'document';
}

/**
 * Reads file bytes from the DocumentPicker URI using Expo SDK 56 File API.
 * Uses ContentResolver on Android (content://) — no legacy copyAsync / readAsStringAsync.
 */
export async function readFileBytesFromUri(
  uri: string
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }> {
  try {
    const file = new File(uri);

    console.log('[upload] read — File.uri:', file.uri);
    console.log('[upload] read — File.exists:', file.exists);

    if (!file.exists) {
      console.error('[upload] read — file does not exist at URI:', uri);
      return {
        ok: false,
        error: 'Selected file is not readable. Try choosing the file again.',
      };
    }

    const bytes = await file.bytes();
    console.log('[upload] file read success — byteLength:', bytes.byteLength);

    if (bytes.byteLength === 0) {
      return { ok: false, error: 'Selected file is empty.' };
    }

    return { ok: true, bytes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read file';
    console.error('[upload] read — failed:', err);
    return { ok: false, error: message };
  }
}

async function uploadBytesToSupabase(
  storagePath: string,
  body: Uint8Array,
  contentType: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  console.log('[upload] supabase.storage.upload', {
    bucket: BUCKET,
    path: storagePath,
    contentType,
    byteLength: body.byteLength,
  });

  const { data, error } = await supabase.storage.from(BUCKET).upload(storagePath, body, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error('[upload] supabase upload failed:', error.message);
    return { ok: false, error: error.message };
  }

  console.log('[upload] upload success:', data?.path ?? storagePath);
  return { ok: true };
}

/**
 * Read picker URI directly → upload to Supabase (no copyAsync, no Blob, no uploadAsync).
 */
export async function uploadFileToStorage(
  storagePath: string,
  file: LocalFile
): Promise<{ ok: true } | { ok: false; error: string }> {
  const contentType = file.mimeType ?? 'application/octet-stream';

  console.log('[upload] starting', {
    storagePath,
    assetUri: file.uri,
    name: file.name,
    mimeType: contentType,
    reportedSize: file.size,
  });

  const readResult = await readFileBytesFromUri(file.uri);
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }

  try {
    const uploadResult = await uploadBytesToSupabase(
      storagePath,
      readResult.bytes,
      contentType
    );

    if (!uploadResult.ok) {
      console.error('[upload] complete — failure:', uploadResult.error);
      return uploadResult;
    }

    console.log('[upload] complete — success:', storagePath);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown upload error';
    console.error('[upload] unexpected error:', err);
    return { ok: false, error: message };
  }
}

export async function removeStorageObject(storagePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([storagePath]);
  if (error) {
    console.warn('[upload] storage remove failed:', error.message);
  }
}

export { sanitizeFileName };
