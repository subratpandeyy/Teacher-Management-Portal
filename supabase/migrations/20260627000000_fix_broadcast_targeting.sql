-- Fix broadcast recipient resolution for ALL target types.
--
-- Root cause:
--   resolve_teacher_ids only handled 'all' → role = 'teacher' and did not
--   handle 'coordinator', 'student', or 'teacher' without a specific target_id.
--   admin_create_broadcast excluded 'coordinator'/'student' from v_safe_target_id.
--
-- Impact:
--   - "Everyone" broadcasts reached only teachers
--   - "Teachers" targeting without specific teacher IDs returned empty
--   - "Coordinators" / "Students" targeting always returned "No targets matched"
--   - No recipient records created for coordinators/students → empty inboxes
--   - Delivery counts only reflected teacher recipients

-- 1. Replace resolve_teacher_ids with proper role resolution for all target types.
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
  v_count INT;
BEGIN
  -- Explicit IDs always win
  IF p_explicit_ids IS NOT NULL AND array_length(p_explicit_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT t) INTO ids FROM unnest(p_explicit_ids) AS t;
    v_count := COALESCE(array_length(ids, 1), 0);
    RAISE NOTICE 'resolve_teacher_ids: explicit_ids, count=%', v_count;
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  -- Group IDs (multiple groups)
  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT gm.teacher_id) INTO ids
    FROM public.group_members gm
    WHERE gm.group_id = ANY (p_group_ids);
    v_count := COALESCE(array_length(ids, 1), 0);
    RAISE NOTICE 'resolve_teacher_ids: group_ids(%), count=%', p_group_ids, v_count;
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  CASE p_target_type
    WHEN 'all' THEN
      SELECT array_agg(id) INTO ids FROM public.profiles;
      RAISE NOTICE 'resolve_teacher_ids: target=all, count=%', COALESCE(array_length(ids, 1), 0);
    WHEN 'teacher' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'teacher';
      END IF;
      RAISE NOTICE 'resolve_teacher_ids: target=teacher, target_id=%, count=%', p_target_id, COALESCE(array_length(ids, 1), 0);
    WHEN 'coordinator' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'coordinator';
      END IF;
      RAISE NOTICE 'resolve_teacher_ids: target=coordinator, target_id=%, count=%', p_target_id, COALESCE(array_length(ids, 1), 0);
    WHEN 'student' THEN
      IF p_target_id IS NOT NULL THEN
        ids := ARRAY[p_target_id];
      ELSE
        SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'student';
      END IF;
      RAISE NOTICE 'resolve_teacher_ids: target=student, target_id=%, count=%', p_target_id, COALESCE(array_length(ids, 1), 0);
    WHEN 'group' THEN
      IF p_target_id IS NOT NULL THEN
        SELECT array_agg(DISTINCT teacher_id) INTO ids
        FROM public.group_members WHERE group_id = p_target_id;
      END IF;
      RAISE NOTICE 'resolve_teacher_ids: target=group, group_id=%, count=%', p_target_id, COALESCE(array_length(ids, 1), 0);
    ELSE
      ids := ARRAY[]::UUID[];
      RAISE NOTICE 'resolve_teacher_ids: unknown target_type=%', p_target_type;
  END CASE;

  RETURN COALESCE(ids, ARRAY[]::UUID[]);
END;
$$;

-- 2. Replace admin_create_broadcast with proper target type handling.
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

  RAISE NOTICE 'admin_create_broadcast: admin=%, target_type=%, target_id=%, explicit_count=%, group_count=%, resolved_count=%',
    v_admin_id, p_target_type, v_safe_target_id,
    COALESCE(array_length(p_teacher_ids, 1), 0),
    COALESCE(array_length(p_group_ids, 1), 0),
    COALESCE(array_length(v_target_ids, 1), 0);

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

  RAISE NOTICE 'admin_create_broadcast: broadcast_id=%, recipients_inserted=%', p_broadcast_id, v_recipient_count;

  RETURN p_broadcast_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_teacher_ids(public.broadcast_target_type, UUID, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[], UUID) TO authenticated;
