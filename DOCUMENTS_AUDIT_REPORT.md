# Documents module audit report

## Update: teacher upload UUID failure (fixed)

**Error:** `invalid input syntax for type uuid: "1780334684972-0000-4000-8000-486f87e5e64c"`

**Cause:** React Native often lacks `crypto.randomUUID()`. The fallback concatenated `Date.now()` into the UUID string, producing an invalid `documents.id`.

**Fix:** `generateUuid()` in `shared/uuid.ts` / `mobile/lib/generateUuid.ts` (proper RFC-4122 v4). Mobile uploads use `mobile/lib/storageService.ts` as the single upload entry point.

---

# Documents module audit report (original)

## Root cause: admin cannot open teacher-uploaded documents

| Issue | Cause |
|-------|--------|
| No UI for teacher uploads on admin | `teacher_documents_for_admin` RPC existed but **was never called** from admin-web |
| Wrong signed URL bucket | `getSignedUrl(path)` defaulted to `documents` bucket; legacy teacher files live under `teacher-documents` with paths like `{uuid}/to_admin/...` |
| Missing `storage_path` in deliveries query | `fetchDocumentDeliveries` did not select `storage_path` / `storage_bucket`, so **Open** never had a path (or used stale UI) |
| RLS blocked teacher DB insert | `20250532000002_portal_v2_rls.sql` set `documents_insert` to **admin only**, overriding teacher `teacher_to_admin` inserts |

## Root cause: “Select document” button does nothing

| Platform | Cause |
|----------|--------|
| **Admin `/documents`** | Only a hidden `<input type="file">` with no visible control; submit with **no files** returned early with **no message** |
| **Mobile `/documents`** | Screen was **view-only** — no Select button or upload flow at all |

## Fixes applied

### Storage & database (`20250532000008_documents_module_fix.sql`)

- Restore `documents_insert` / `documents_select` for `teacher_to_admin`
- Storage policies: `{teacher_id}/inbound/...` in `documents` bucket (teacher insert, admin/teacher read)
- `teacher_documents_for_admin` returns `storage_bucket`
- `teacher_assigned_documents` returns `storage_bucket`

### Shared helpers

- `shared/documentAccess.ts` — `resolveDocumentStorageBucket()`
- `admin-web/src/lib/openDocument.ts` — `validateAndOpenDocument()` / `openDocumentInBrowser()`
- `mobile/lib/openDocument.ts` — same + `Linking.openURL`
- `mobile/lib/documentAccess.ts` — Metro-local copy

### Admin web

- `DocumentsPage`: visible **Select document(s)** button, logging, error when no files, **From teachers** list, Open uses signed URL with correct bucket
- `features.ts`: `fetchAllTeacherUploadsForAdmin`, `fetchTeacherUploadsForAdmin`, deliveries include `storage_path` + `storage_bucket`
- `TeacherDetailPanel`: **Uploaded by teacher** section

### Mobile

- **Select document** `Pressable` → `pickDocumentForUpload()` (Expo SDK 56: `!result.canceled`, `result.assets[0]`)
- `uploadTeacherDocumentToAdmin()` → storage + `documents` row
- Open assigned docs via `validateAndOpenDocument`

## Files modified

| File |
|------|
| `supabase/migrations/20250532000008_documents_module_fix.sql` |
| `shared/documentAccess.ts` |
| `admin-web/src/lib/openDocument.ts` |
| `admin-web/src/lib/features.ts` |
| `admin-web/src/pages/DocumentsPage.tsx` |
| `admin-web/src/components/TeacherDetailPanel.tsx` |
| `mobile/lib/openDocument.ts` |
| `mobile/lib/documentAccess.ts` |
| `mobile/lib/api.ts` |
| `mobile/app/(teacher)/documents.tsx` |

## Deploy

```bash
cd teacher-portal
npx supabase db push --yes
```

Restart admin-web and Expo (`npx expo start -c`).

## Verification

1. **Teacher mobile** → Documents → **Select document** → pick PDF → see success message.
2. **Admin** → Documents → **From teachers** → **Open**.
3. **Admin** → Teachers → teacher → Documents → **Uploaded by teacher** → **Open**.
4. **Admin** → Documents → **Select document(s)** → choose file → **Upload & assign** → **Deliveries** → **Open**.
