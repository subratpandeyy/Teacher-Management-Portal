-- Fix broadcast recipient resolution for all target types.
-- The previous resolve_teacher_ids only handled 'all' → WHERE role = 'teacher'
-- and did not handle 'coordinator' or 'student' target types at all.
-- The frontend resolveBroadcastRpcTarget also dropped coordinator/student to 'all'.

-- 1. Replace resolve_teacher_ids with a version that handles every target type.
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

-- 2. Update admin_create_broadcast error message (was "No teachers matched…")
--    Permission check stays admin-only (coordinators use separate create_broadcast
--    from the Phase 7 migration if needed).
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
  v_teacher_ids UUID[];
  v_tid UUID;
  v_safe_target_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_admin_id := auth.uid();

  v_safe_target_id := CASE
    WHEN p_target_type IN ('group', 'teacher', 'coordinator', 'student') THEN p_target_id
    ELSE NULL
  END;

  v_teacher_ids := public.resolve_teacher_ids(
    p_target_type, v_safe_target_id, p_teacher_ids, p_group_ids
  );

  IF v_teacher_ids IS NULL OR array_length(v_teacher_ids, 1) IS NULL OR array_length(v_teacher_ids, 1) = 0 THEN
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

  FOREACH v_tid IN ARRAY v_teacher_ids LOOP
    INSERT INTO public.broadcast_recipients (broadcast_id, teacher_id)
    VALUES (p_broadcast_id, v_tid)
    ON CONFLICT (broadcast_id, teacher_id) DO NOTHING;
  END LOOP;

  RETURN p_broadcast_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_teacher_ids(public.broadcast_target_type, UUID, UUID[], UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[], UUID) TO authenticated;
