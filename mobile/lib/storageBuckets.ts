/**
 * Storage bucket helpers (mobile bundle).
 * Keep in sync with ../shared/storage.ts
 */

export const STORAGE_BUCKETS = {
  documents: 'documents',
  attachments: 'attachments',
  chatFiles: 'chat-files',
  legacy: 'teacher-documents',
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

const LEGACY_ROOTS = new Set(['shared', 'attachments', 'chat', 'broadcasts']);

export function isLegacyStoragePath(storagePath: string): boolean {
  const root = storagePath.split('/')[0] ?? '';
  return LEGACY_ROOTS.has(root);
}

export function resolveStorageBucket(
  storagePath: string,
  defaultBucket: StorageBucket
): StorageBucket {
  return isLegacyStoragePath(storagePath) ? STORAGE_BUCKETS.legacy : defaultBucket;
}

export function sanitizeStorageFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'file';
}
