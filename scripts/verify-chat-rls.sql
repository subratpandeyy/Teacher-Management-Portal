-- Verification: chat RLS policies and migration health
-- Run after: supabase db push

-- 1. Policies must NOT reference NEW/OLD (manual review of output)
SELECT schemaname, tablename, policyname, cmd,
       qual AS using_expr,
       with_check AS check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('chat_messages', 'conversation_participants', 'conversations')
ORDER BY tablename, policyname;

-- 2. Required functions exist
SELECT proname FROM pg_proc
WHERE proname IN (
  'is_conversation_participant',
  'ensure_direct_conversation',
  'ensure_teacher_conversation',
  'get_user_conversations_with_unread',
  'mark_conversation_as_read'
)
ORDER BY proname;

-- 3. conversation_participants has last_read_at
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'conversation_participants'
  AND column_name = 'last_read_at';

-- 4. groups_insert blocks teachers (policy text check)
SELECT policyname, with_check
FROM pg_policies
WHERE tablename = 'groups' AND policyname = 'groups_insert_policy';

-- 5. Sample participant check (replace UUIDs)
-- SELECT public.is_conversation_participant('<conversation_id>', '<profile_id>');
