import type { DocumentRef } from '../../../shared/documentAccess';
import { resolveDocumentStorageBucket } from '../../../shared/documentAccess';
import { createSignedStorageUrl } from './storageUpload';

export type OpenDocumentResult =
  | { ok: true; signedUrl: string }
  | { ok: false; error: string };

/**
 * Validate storage path and open a private document via signed URL.
 * Buckets are never public — always uses createSignedUrl.
 */
export async function validateAndOpenDocument(doc: DocumentRef): Promise<OpenDocumentResult> {
  if (!doc.storage_path?.trim()) {
    console.error('[openDocument] missing storage_path', doc);
    return { ok: false, error: 'Document has no storage path.' };
  }

  const bucket = resolveDocumentStorageBucket(doc);
  console.log('[openDocument] signing', { bucket, path: doc.storage_path });

  const { data, error } = await createSignedStorageUrl(doc.storage_path, bucket, 3600);

  if (error) {
    console.error('[openDocument] sign failed', error.message);
    return { ok: false, error: error.message };
  }

  if (!data?.signedUrl) {
    return { ok: false, error: 'Could not generate download URL.' };
  }

  console.log('[openDocument] signed URL ok');
  return { ok: true, signedUrl: data.signedUrl };
}

export async function openDocumentInBrowser(doc: DocumentRef): Promise<OpenDocumentResult> {
  const result = await validateAndOpenDocument(doc);
  if (!result.ok) return result;
  window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
  return result;
}
