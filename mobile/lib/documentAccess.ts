/** Keep in sync with ../shared/documentAccess.ts */
import { resolveStorageBucket, STORAGE_BUCKETS, type StorageBucket } from './storageBuckets';

export type DocumentRef = {
  storage_path: string;
  storage_bucket?: string | null;
  mime_type?: string | null;
  title?: string;
};

export function resolveDocumentStorageBucket(doc: DocumentRef): StorageBucket {
  if (doc.storage_bucket && Object.values(STORAGE_BUCKETS).includes(doc.storage_bucket as StorageBucket)) {
    return doc.storage_bucket as StorageBucket;
  }
  return resolveStorageBucket(doc.storage_path, STORAGE_BUCKETS.documents);
}
