-- Phase 7: Broadcast System Consolidation

-- 1. Update broadcast_target_type (already done in shared types, but let's ensure DB)
DO $$ BEGIN
  ALTER TYPE public.broadcast_target_type ADD VALUE IF NOT EXISTS 'coordinator';
  ALTER TYPE public.broadcast_target_type ADD VALUE IF NOT EXISTS 'student';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Update resolve_teacher_ids to resolve any role
CREATE OR REPLACE FUNCTION public.resolve_broadcast_targets(
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_explicit_ids UUID[] DEFAULT NULL
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
  IF p_explicit_ids IS NOT NULL AND array_length(p_explicit_ids, 1) > 0 THEN
    RETURN p_explicit_ids;
  END IF;

  CASE p_target_type
    WHEN 'all' THEN
      SELECT array_agg(id) INTO ids FROM public.profiles;
    WHEN 'teacher' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'teacher';
      END IF;
    WHEN 'coordinator' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'coordinator';
      END IF;
    WHEN 'student' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'student';
      END IF;
    WHEN 'group' THEN
      SELECT array_agg(teacher_id) INTO ids
      FROM public.group_members WHERE group_id = p_target_id;
    ELSE
      ids := ARRAY[]::UUID[];
  END CASE;

  RETURN COALESCE(ids, ARRAY[]::UUID[]);
END;
$$;

-- 3. Unified create broadcast function
CREATE OR REPLACE FUNCTION public.create_broadcast(
  p_title TEXT,
  p_message TEXT,
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_explicit_ids UUID[] DEFAULT NULL,
  p_attachment_url TEXT DEFAULT NULL,
  p_attachment_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender_id UUID;
  v_broadcast_id UUID;
  v_target_ids UUID[];
  v_tid UUID;
BEGIN
  v_sender_id := auth.uid();
  
  -- Permission check: only admin or coordinator
  IF NOT (public.is_admin() OR public.has_role('coordinator')) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_target_ids := public.resolve_broadcast_targets(p_target_type, p_target_id, p_explicit_ids);

  IF array_length(v_target_ids, 1) IS NULL OR array_length(v_target_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No targets matched the selection';
  END IF;

  INSERT INTO public.broadcasts (
    admin_id, created_by, title, body, message,
    attachment_url, attachment_name,
    target_type, target_id, published_at
  )
  VALUES (
    v_sender_id, v_sender_id, p_title, p_message, p_message,
    p_attachment_url, p_attachment_name,
    p_target_type, p_target_id, NOW()
  )
  RETURNING id INTO v_broadcast_id;

  FOREACH v_tid IN ARRAY v_target_ids LOOP
    INSERT INTO public.broadcast_recipients (broadcast_id, teacher_id) -- teacher_id is generic recipient_id here
    VALUES (v_broadcast_id, v_tid)
    ON CONFLICT (broadcast_id, teacher_id) DO NOTHING;
  END LOOP;

  RETURN v_broadcast_id;
END;
$$;
