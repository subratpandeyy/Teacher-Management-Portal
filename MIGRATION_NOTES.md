# Teacher Portal v2 — deploy checklist

## Migrations (apply in order)

```bash
cd teacher-portal
npx supabase db push --yes
```

Latest migrations:

- `20250532000004_portal_v2_fixes.sql` — `broadcast_attachments`, `register_broadcast_attachment`, multi-group `resolve_teacher_ids`, `teacher_my_broadcasts` with attachments JSON, chat/feedback `updated_at` triggers, document multi-group assign
- `20250532000005_portal_v2_storage_fixes.sql` — storage policies for `attachments/broadcasts/` and `attachments/chat/`

## After push

1. Supabase Dashboard → **Settings → API** → reload schema cache if RPCs are missing.
2. Confirm `teacher-portal` bucket exists with policies from migration 003/005.

## Smoke tests

| Flow | Admin | Teacher |
|------|-------|---------|
| Broadcast → all / group / groups / teacher | Broadcasts page → send + optional file | Inbox → message + 📎 attachments |
| Broadcast feedback | Broadcast detail (if UI) or SQL | Inbox detail → submit feedback |
| Documents | Documents page → upload + target | Documents tab (read-only) |
| Chat | Teacher detail → Chat tab (edit/delete/attach) | Chat screen |
| Groups | Groups page → members | Only sees own group data |

## Storage paths (do not put paths in UUID columns)

- Broadcast files: `attachments/broadcasts/{broadcastId}/{filename}` → `register_broadcast_attachment` RPC
- Chat files: `attachments/chat/{conversationId}/{filename}`
- Documents: `shared/{documentId}/{filename}`

## Key RPCs

- `admin_create_broadcast` — creates broadcast + recipients (no attachment args; attach after)
- `register_broadcast_attachment` — metadata after storage upload
- `teacher_my_broadcasts` — teacher inbox with `attachments` JSONB
- `admin_assign_document_to_target` — `p_group_ids` for multiple groups
- `teacher_assigned_documents` — teacher document list
