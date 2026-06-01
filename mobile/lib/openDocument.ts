import { Linking } from 'react-native';
import type { DocumentRef } from './documentAccess';
import { resolveDocumentStorageBucket } from './documentAccess';
import { createSignedStorageUrl } from './storageService';

export type OpenDocumentResult =
  | { ok: true; signedUrl: string }
  | { ok: false; error: string };

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

  return { ok: true, signedUrl: data.signedUrl };
}

export async function openDocumentWithLinking(doc: DocumentRef): Promise<OpenDocumentResult> {
  const result = await validateAndOpenDocument(doc);
  if (!result.ok) return result;

  const canOpen = await Linking.canOpenURL(result.signedUrl);
  if (!canOpen) {
    return { ok: false, error: 'No app available to open this file.' };
  }

  await Linking.openURL(result.signedUrl);
  console.log('[openDocument] opened via Linking');
  return result;
}
