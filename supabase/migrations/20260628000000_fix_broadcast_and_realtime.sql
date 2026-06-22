-- Migration: Fix broadcast targeting, realtime publication, and replica identity
-- Root causes:
--   1. resolve_teacher_ids was outdated in live DB — only handled 'teacher' role
--   2. conversation_participants and conversations not in realtime publication
--   3. REPLICA IDENTITY was DEFAULT on chat tables (no full row on UPDATE/DELETE)

-- 1. Fix resolve_teacher_ids with correct CASE-based logic
CREATE OR REPLACE FUNCTION public.resolve_teacher_ids(
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_explicit_ids UUID[] DEFAULT NULL,
  p_group_ids UUID[] DEFAULT NULL
)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ids UUID[];
BEGIN
  -- Explicit IDs always win
  IF p_explicit_ids IS NOT NULL AND array_length(p_explicit_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT t) INTO ids FROM unnest(p_explicit_ids) AS t;
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  -- Group IDs (multiple groups)
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT gm.teacher_id) INTO ids
    FROM public.group_members gm
    WHERE gm.group_id = ANY (p_group_ids);
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  CASE p_target_type
    WHEN 'all' THEN
      SELECT array_agg(id) INTO ids FROM public.profiles WHERE status = 'active' AND deleted_at IS NULL;
    WHEN 'teacher' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'teacher' AND status = 'active' AND deleted_at IS NULL;
      END IF;
    WHEN 'coordinator' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'coordinator' AND status = 'active' AND deleted_at IS NULL;
      END IF;
    WHEN 'student' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'student' AND status = 'active' AND deleted_at IS NULL;
      END IF;
    WHEN 'group' THEN
      IF p_target_id IS NOT NULL THEN
        SELECT array_agg(DISTINCT teacher_id) INTO ids
        FROM public.group_members WHERE group_id = p_target_id;
      END IF;
    ELSE
      ids := ARRAY[]::UUID[];
  END CASE;

  RETURN COALESCE(ids, ARRAY[]::UUID[]);
END;
$$;

-- 2. Fix admin_create_broadcast
DROP FUNCTION IF EXISTS public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[], UUID);

CREATE OR REPLACE FUNCTION public.admin_create_broadcast(
  p_title TEXT,
  p_message TEXT,
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_teacher_ids UUID[] DEFAULT NULL,
  p_group_ids UUID[] DEFAULT NULL,
  p_broadcast_id UUID DEFAULT gen_random_uuid()
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_target_ids UUID[];
  v_tid UUID;
  v_safe_target_id UUID;
  v_recipient_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_admin_id := auth.uid();

  v_safe_target_id := CASE
    WHEN p_target_type IN ('group', 'teacher', 'coordinator', 'student') THEN p_target_id
    ELSE NULL
  END;

  v_target_ids := public.resolve_teacher_ids(
    p_target_type, v_safe_target_id, p_teacher_ids, p_group_ids
  );

  IF v_target_ids IS NULL OR array_length(v_target_ids, 1) IS NULL OR array_length(v_target_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No targets matched the selected target';
  END IF;

  INSERT INTO public.broadcasts (
    id, admin_id, created_by, title, body, message,
    target_type, target_id, published_at
  )
  VALUES (
    p_broadcast_id, v_admin_id, v_admin_id, p_title, p_message, p_message,
    p_target_type, v_safe_target_id, NOW()
  );

  v_recipient_count := 0;
  FOREACH v_tid IN ARRAY v_target_ids LOOP
    INSERT INTO public.broadcast_recipients (broadcast_id, teacher_id)
    VALUES (p_broadcast_id, v_tid)
    ON CONFLICT (broadcast_id, teacher_id) DO NOTHING;
    v_recipient_count := v_recipient_count + 1;
  END LOOP;

  RETURN p_broadcast_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_teacher_ids(public.broadcast_target_type, UUID, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[], UUID) TO authenticated;

-- 3. Add tables to realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversation_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_participants;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;

-- 4. Set REPLICA IDENTITY FULL for better realtime support
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_participants REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
