import { resolveStorageBucket, STORAGE_BUCKETS, type StorageBucket } from './storage';

export type DocumentRef = {
  storage_path: string;
  storage_bucket?: string | null;
  mime_type?: string | null;
  title?: string;
};

/** Resolve which private bucket holds this object. */
export function resolveDocumentStorageBucket(doc: DocumentRef): StorageBucket {
  if (
    doc.storage_bucket &&
    (Object.values(STORAGE_BUCKETS) as string[]).includes(doc.storage_bucket)
  ) {
    return doc.storage_bucket as StorageBucket;
  }
  return resolveStorageBucket(doc.storage_path, STORAGE_BUCKETS.documents);
}
