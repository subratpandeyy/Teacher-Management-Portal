# Upload system (Expo SDK 56 + Supabase Storage)

## Root cause

Teacher uploads failed on Android Expo Go after `expo-document-picker` returned a **cache URI** under `DocumentPicker/`. The legacy pipeline called `expo-file-system/legacy` **`copyAsync`** to copy into `upload-staging/`, then **`readAsStringAsync`** / `fetch` fallbacks. Those paths are **not readable** from the legacy FileSystem module on Expo Go (`IOException: isn't readable`), so uploads failed even when `getInfoAsync` reported `exists: true`.

Admin uploads worked because the browser uses the native **`File`** API and `supabase.storage.upload(File)` directly—no copy step.

## Old flow (mobile)

1. `DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })`
2. `preparePickedFileUri()` → `FileSystem.copyAsync` to staging
3. `readUriAsBytes()` → `fetch` / `File.bytes()` / base64 `readAsStringAsync`
4. `supabase.storage.upload(path, Uint8Array)`

## New flow (mobile)

1. `File.pickFileAsync({ mimeTypes })` from **`expo-file-system`** (SDK 56)
2. Native **`File`** instance with readable `arrayBuffer()`
3. `readExpoFileBytes()` → `file.arrayBuffer()` → `Uint8Array`
4. `supabase.storage.upload(path, bytes, { contentType })`
5. DB insert in `api.ts` (documents / chat) with rollback `removeStorageFile` on failure

**No** `copyAsync`, `readAsStringAsync`, `uploadAsync`, or `new Blob` hacks.

## New flow (admin-web)

Unchanged mechanism: browser `File` → `storageUpload.uploadFile()`. Added **`[upload]`** console logs for parity.

## Shared pieces

| File | Role |
|------|------|
| `shared/upload.ts` | `UPLOAD_LOG` prefix + result types |
| `shared/storage.ts` | Bucket names, `resolveStorageBucket`, path sanitization |
| `mobile/lib/storageService.ts` | Mobile upload + signed URLs |
| `mobile/lib/documentPicker.ts` | `File.pickFileAsync` wrapper |
| `admin-web/src/lib/storageUpload.ts` | Admin upload + signed URLs |

## Buckets

| Bucket | Use |
|--------|-----|
| `documents` | Admin→teacher assignments, teacher→admin inbound (`{teacherId}/inbound/{docId}/…`) |
| `attachments` | Broadcast files (`{broadcastId}/{filename}`) |
| `chat-files` | Chat attachments (`{conversationId}/{segment}/{filename}`) |

`storage_path` columns store **object paths only**, never bucket names. `storage_bucket` / `resolveStorageBucket()` select the bucket for signed URLs.

## `[upload]` log sequence

- `[upload] opening file picker`
- `[upload] file selected`
- `[upload] file exists`
- `[upload] arrayBuffer created`
- `[upload] uploading to storage`
- `[upload] storage upload success`
- `[upload] database insert success` (mobile `api.ts` after documents insert)
- `[upload] upload failed` (any step)

## Files changed

- `shared/upload.ts` (new)
- `mobile/lib/storageService.ts` (rewrite)
- `mobile/lib/documentPicker.ts` (rewrite — `File.pickFileAsync`)
- `mobile/lib/storageUpload.ts` (re-exports)
- `mobile/lib/api.ts` (`PickedFile`, upload params)
- `mobile/app/(teacher)/documents.tsx`
- `mobile/app/(teacher)/chat.tsx`
- `admin-web/src/lib/storageUpload.ts` (`[upload]` logs)

## Manual test checklist

1. **Teacher → admin document**: Documents → Select Document → confirm in admin “From teachers” → open/download.
2. **Admin → teacher document**: Admin assign → teacher Documents → open.
3. **Chat**: Teacher attach file → admin chat view → open attachment.
4. **Broadcast**: Admin attach on broadcast → teacher broadcast detail → open attachment.
5. Watch Metro logs for full `[upload]` sequence through `storage upload success` and `database insert success`.

## Test results (automated)

- `mobile`: `npx tsc --noEmit` — pass
- `admin-web`: `npm run build` — pass

Runtime verification on device (Expo Go) required for picker + `arrayBuffer()` on your Android build.
