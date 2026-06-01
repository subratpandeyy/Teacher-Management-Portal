# Storage upload audit report

## Root cause: `invalid input syntax for type uuid: "attachments"`

### What happened

Uploads used the **`teacher-documents`** bucket with object paths such as:

- `shared/{docId}/{file}`
- `attachments/broadcasts/{broadcastId}/{file}`
- `attachments/chat/{conversationId}/{file}`

The original migration `20250530000003_storage.sql` defined RLS policies that call:

```sql
public.storage_teacher_id_from_path(name) = auth.uid()
```

That function did:

```sql
split_part(object_name, '/', 1)::UUID
```

For path `attachments/broadcasts/...`, the first segment is the literal string **`attachments`**, which PostgreSQL cannot cast to UUID. Policy evaluation **throws** during `storage.upload()`, producing:

```text
invalid input syntax for type uuid: "attachments"
```

This is **not** caused by:

- Manual `INSERT INTO storage.objects` (none exist in app code)
- `.from('attachments')` as a Supabase **table** (not used)
- Putting `"attachments"` into a UUID column like `target_id` on broadcasts

It **is** caused by **RLS policy expression error** on the storage bucket.

### Affected code paths (before fix)

| Feature | Bucket (old) | Path prefix (old) | Triggered legacy policy |
|---------|--------------|-------------------|-------------------------|
| Admin documents | `teacher-documents` | `shared/...` | Yes (`shared` → cast fail) |
| Broadcast attachments | `teacher-documents` | `attachments/broadcasts/...` | Yes (`attachments` → cast fail) |
| Chat attachments | `teacher-documents` | `attachments/chat/...` | Yes (`attachments` → cast fail) |

---

## Fixes applied

### 1. SQL migration `20250532000007_storage_uuid_fix_and_buckets.sql`

- **`storage_teacher_id_from_path`**: safe UUID parse (returns `NULL` instead of throwing).
- **Legacy `teacher-documents` policies**: admin allowed; teacher only when first segment is a valid UUID; read allowed for legacy `shared/`, `attachments/`, `chat/` paths.
- **New buckets** (created if missing):
  - `documents` — admin docs: `{documentId}/{filename}`
  - `attachments` — broadcast files: `{broadcastId}/{filename}`
  - `chat-files` — chat files: `{conversationId}/{segment}/{filename}`
- **RLS** on new buckets: admin full access; teachers read via `document_recipients` / `broadcast_attachments`+`broadcast_recipients` / `conversations`+`chat_messages`.
- **`admin_create_broadcast`**: optional `p_broadcast_id` so attachment can upload **before** broadcast row exists.
- **`register_broadcast_attachment`**: `storage_bucket` column support (default `attachments`).

### 2. Shared upload contract

`shared/storage.ts` — bucket names + `resolveStorageBucket()` for legacy paths still in DB.

### 3. Reusable helpers (Storage API only)

| App | File | Function |
|-----|------|----------|
| Admin | `admin-web/src/lib/storageUpload.ts` | `uploadFile({ bucket, path, file })` |
| Mobile | `mobile/lib/storageUpload.ts` | `uploadFile({ bucket, path, fileUri, fileName })` |

Both use **only**:

```ts
supabase.storage.from(bucketName).upload(path, body)
```

No manual `storage.objects` inserts anywhere in the repo.

### 4. Feature flows

**Documents (admin)**

1. Upload to `documents` bucket → `{docId}/{filename}`
2. Insert `documents` row with `storage_bucket: 'documents'`
3. `admin_assign_document_to_target` → recipients  
On failure: remove object + delete row.

**Broadcasts (admin)**

1. Pre-generate `broadcastId`
2. Upload to `attachments` bucket (if file selected)
3. `admin_create_broadcast(..., p_broadcast_id)`
4. `register_broadcast_attachment`  
On failure: remove uploaded object; return explicit error (no silent success).

**Chat (admin + teacher)**

- Upload to `chat-files` bucket: `{conversationId}/{uuid}/{filename}`
- Insert `chat_messages` with `attachment_url` = storage path (not bucket name)

### 5. Signed URLs

`createSignedStorageUrl(path, defaultBucket)` uses `resolveStorageBucket()` so **legacy** rows under `teacher-documents` still open.

---

## Files changed

| File | Change |
|------|--------|
| `supabase/migrations/20250532000007_storage_uuid_fix_and_buckets.sql` | **New** — root fix + buckets + RPC |
| `shared/storage.ts` | **New** — bucket constants |
| `admin-web/src/lib/storageUpload.ts` | **New** — `uploadFile` helper |
| `admin-web/src/lib/features.ts` | Buckets, broadcast flow, documents, chat |
| `admin-web/src/pages/BroadcastsPage.tsx` | `sendBroadcastWithOptionalAttachment` |
| `admin-web/src/pages/DocumentsPage.tsx` | Clearer error when all uploads fail |
| `mobile/lib/storageUpload.ts` | `uploadFile` + bucket param |
| `mobile/lib/api.ts` | Signed URLs per bucket |
| `mobile/app/(teacher)/inbox.tsx` | Broadcast attachments bucket |

---

## Verification checklist

```bash
cd teacher-portal
npx supabase db push --yes
```

1. **Documents**: Admin → Documents → upload PDF → teacher Docs → open.
2. **Broadcast**: Send with attachment → teacher Inbox → open 📎.
3. **Chat**: Teacher/admin send file → tap to open.
4. Confirm Supabase Dashboard → Storage → buckets: `documents`, `attachments`, `chat-files` (and legacy `teacher-documents` for old files).

---

## Manual inserts

**Search result:** No application code inserts into `storage.objects`. All uploads go through the Storage API.
