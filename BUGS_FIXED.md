# Teacher Portal — audit bugs found and fixed

## 1. Documents not reaching teachers

| Issue | Fix |
|-------|-----|
| `admin_assign_document_to_target` could succeed with **0 recipients** (empty group / no teachers selected) | RPC now raises if no teachers match; client rolls back storage + row |
| Admin UI allowed upload with **no teachers/groups selected** | Validation on `DocumentsPage` before upload |
| `teacher_assigned_documents` out of sync across migrations | Canonical RPC in `20250532000006_portal_audit_fixes.sql` |

## 2. Chat text-only / attachments broken

| Issue | Fix |
|-------|-----|
| Storage policies expected `chat/{conversationId}/` but uploads used `attachments/chat/{conversationId}/` | New `storage_chat_attachments_v2_*` policies in migration 006 |
| Teachers could not upload files in chat | `uploadChatAttachment` + 📎 button in mobile `chat.tsx` |
| Missing `attachment_type` on messages | Column + insert from admin and teacher clients |
| Teachers without `conversations` row saw hard error | `ensure_teacher_conversation` RPC + mobile uses it |
| Admin could not share vault documents in chat | `shareDocumentInChat` + "Send in chat" on teacher detail documents |

## 3. Broadcast feedback leaking between broadcasts

| Issue | Fix |
|-------|-----|
| Admin UI **race**: expanding broadcast B while A’s fetch finished last showed A’s feedback under B | `detailsSeq` guard on `BroadcastsPage` |
| Teacher UI could show stale feedback when switching quickly | Per-broadcast cache + `feedbackLoadSeq` on inbox detail |
| `fetchBroadcastFeedback` optional filter could return **all** feedback | `broadcastId` is now required |
| Delete feedback without `broadcast_id` filter | `deleteMyBroadcastFeedback` now scopes by broadcast |

## 4. Broadcast attachments

| Issue | Fix |
|-------|-----|
| Admin details only showed legacy `attachment_name` | Loads `broadcast_attachments` when expanding a broadcast |

## 5. Offline mode removed

| Removed | |
|---------|---|
| `mobile/lib/offlineDocuments.ts` | |
| `mobile/app/(teacher)/downloads.tsx` tab | |
| Offline caching on document open | |
| "Offline" tab label | |

Auth still uses `AsyncStorage` for Supabase session only.

## 6. Group permissions

No schema change — existing RLS + `resolve_teacher_ids` retained. Teachers use RPCs (`teacher_my_broadcasts`, `teacher_assigned_documents`) and conversation-scoped chat.

## 7. Realtime

| Area | Notes |
|------|-------|
| Chat | Single channel per conversation; reload guarded by seq ref (mobile) |
| Broadcasts | `broadcast_recipients` INSERT → reload inbox |
| Feedback | No realtime (fetch on open only) — avoids duplicate cards |
| Documents | Pull-to-refresh only |

## 8. Storage uploads (mobile)

| Issue | Fix |
|-------|-----|
| Expo Go Android `content://` URIs | `storageUpload.ts` uses `expo-file-system` `File.bytes()` (unchanged, verified) |
| DOCX not pickable | Extended `documentPicker` MIME types |

## Files changed (summary)

- `supabase/migrations/20250532000006_portal_audit_fixes.sql` (new)
- `mobile/lib/api.ts`, `chat.tsx`, `inbox.tsx`, `documents.tsx`, `_layout.tsx`, `documentPicker.ts`
- `admin-web/src/lib/features.ts`, `BroadcastsPage.tsx`, `DocumentsPage.tsx`, `TeacherDetailPanel.tsx`
- `shared/types.ts`
- Removed: `offlineDocuments.ts`, `downloads.tsx`

## Deploy

```bash
cd teacher-portal
npx supabase db push --yes
```

Then smoke-test: document upload → teacher Docs; chat attach both ways; broadcast feedback per broadcast; broadcast with PDF attachment.
