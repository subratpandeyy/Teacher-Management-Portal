-- Platform refinements: coordinator universal chat, teacher group restriction,
-- bulk reassignment, document distribution, unread helpers

-- ─── 1. Direct conversation RPC (coordinator universal chat) ───────────────────
CREATE OR REPLACE FUNCTION public.ensure_direct_conversation(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_conv_id UUID;
  v_caller UUID;
BEGIN
  IF p_user_a IS NULL OR p_user_b IS NULL THEN
    RAISE EXCEPTION 'Both user IDs required';
  END IF;

  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create conversation with self';
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NOT NULL
    AND v_caller NOT IN (p_user_a, p_user_b)
    AND NOT public.is_admin()
  THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT cp1.conversation_id INTO v_conv_id
  FROM public.conversation_participants cp1
  JOIN public.conversation_participants cp2
    ON cp2.conversation_id = cp1.conversation_id
   AND cp2.profile_id = p_user_b
  JOIN public.conversations c ON c.id = cp1.conversation_id
  WHERE cp1.profile_id = p_user_a
    AND (c.type IS NULL OR c.type = 'direct')
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (teacher_id, type)
    VALUES (p_user_a, 'direct')
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv_id, p_user_a), (v_conv_id, p_user_b)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN v_conv_id;
END;
$$;

ALTER FUNCTION public.ensure_direct_conversation(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(UUID, UUID) TO authenticated;

-- ─── 2. Teachers cannot create/manage groups (admin + coordinator only) ──────
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;

CREATE POLICY "groups_insert_policy" ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_admin()
      OR public.has_role('coordinator'::public.user_role)
    )
  );

DROP POLICY IF EXISTS "groups_update_policy" ON public.groups;
CREATE POLICY "groups_update_policy" ON public.groups
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND public.has_role('coordinator'::public.user_role)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND public.has_role('coordinator'::public.user_role)
    )
  );

DROP POLICY IF EXISTS "groups_delete_policy" ON public.groups;
CREATE POLICY "groups_delete_policy" ON public.groups
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR (
      created_by = auth.uid()
      AND public.has_role('coordinator'::public.user_role)
    )
  );

-- Teachers may self-join public groups only; cannot add/remove others
CREATE OR REPLACE FUNCTION public.can_add_group_member(
  p_group_id UUID,
  p_member_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_creator_id UUID;
  v_creator_role public.user_role;
  v_group_type TEXT;
  v_user_role public.user_role;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;
  IF v_user_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  SELECT created_by, creator_role, type
  INTO v_creator_id, v_creator_role, v_group_type
  FROM public.groups
  WHERE id = p_group_id;

  IF v_creator_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Teachers and students: self-join public groups only
  IF p_member_id = p_user_id AND v_group_type = 'public' THEN
    RETURN v_user_role IN ('teacher'::public.user_role, 'student'::public.user_role, 'coordinator'::public.user_role);
  END IF;

  -- Group management: admin or coordinator creator only
  IF v_creator_id = p_user_id AND v_creator_role IN ('admin'::public.user_role, 'coordinator'::public.user_role) THEN
    IF v_creator_role = 'coordinator'::public.user_role THEN
      RETURN public.belongs_to_coordinator(p_member_id, p_user_id)
        OR p_member_id = p_user_id;
    END IF;
    RETURN TRUE;
  END IF;

  RETURN public.is_admin();
END;
$$;

CREATE OR REPLACE FUNCTION public.can_remove_group_member(
  p_group_id UUID,
  p_member_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_creator_id UUID;
  v_creator_role public.user_role;
  v_user_role public.user_role;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;
  IF v_user_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  IF p_member_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  SELECT created_by, creator_role INTO v_creator_id, v_creator_role
  FROM public.groups WHERE id = p_group_id;

  IF v_creator_id = p_user_id AND v_creator_role IN ('admin'::public.user_role, 'coordinator'::public.user_role) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- ─── 3. Bulk coordinator reassignment with audit trail ───────────────────────
CREATE OR REPLACE FUNCTION public.bulk_reassign_coordinator(
  p_target_ids UUID[],
  p_assigned_type TEXT,
  p_new_coordinator_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_target UUID;
  v_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_assigned_type NOT IN ('teacher', 'student') THEN
    RAISE EXCEPTION 'assigned_type must be teacher or student';
  END IF;

  IF p_target_ids IS NULL OR array_length(p_target_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'No targets provided';
  END IF;

  FOREACH v_target IN ARRAY p_target_ids LOOP
    IF p_assigned_type = 'teacher' THEN
      INSERT INTO public.coordinator_assignments (coordinator_id, teacher_id)
      VALUES (p_new_coordinator_id, v_target);
    ELSE
      INSERT INTO public.coordinator_assignments (coordinator_id, student_id)
      VALUES (p_new_coordinator_id, v_target);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_reassign_coordinator(UUID[], TEXT, UUID) TO authenticated;

-- ─── 4. Extend document distribution RPC for all recipient types ─────────────
CREATE OR REPLACE FUNCTION public.admin_assign_document_to_target(
  p_document_id UUID,
  p_target_type TEXT,
  p_target_id UUID,
  p_teacher_ids UUID[],
  p_group_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_ids UUID[];
  v_inserted INTEGER := 0;
  tid UUID;
  v_uploaded_by UUID;
  v_caller_role public.user_role;
BEGIN
  SELECT uploaded_by INTO v_uploaded_by FROM public.documents WHERE id = p_document_id;
  IF v_uploaded_by IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() <> v_uploaded_by AND v_caller_role <> 'admin'::public.user_role THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_target_type = 'all' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE deleted_at IS NULL AND role <> 'admin'::public.user_role;
  ELSIF p_target_type IN ('role_student', 'student') THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE role = 'student'::public.user_role AND deleted_at IS NULL;
  ELSIF p_target_type IN ('role_teacher', 'teacher_role') THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE role = 'teacher'::public.user_role AND deleted_at IS NULL;
  ELSIF p_target_type IN ('role_coordinator', 'coordinator') THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE role = 'coordinator'::public.user_role AND deleted_at IS NULL;
  ELSIF p_target_type = 'group' AND p_target_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT teacher_id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.group_members WHERE group_id = p_target_id;
  ELSIF p_target_type IN ('groups', 'group') AND p_group_ids IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT teacher_id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.group_members WHERE group_id = ANY(p_group_ids);
  ELSIF p_target_type IN ('teacher', 'user', 'users') AND p_teacher_ids IS NOT NULL THEN
    v_ids := p_teacher_ids;
  ELSE
    v_ids := ARRAY[]::UUID[];
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No recipients matched the selected target';
  END IF;

  UPDATE public.documents
  SET target_type = CASE
        WHEN p_target_type IN ('group', 'groups') THEN 'group'::public.broadcast_target_type
        WHEN p_target_type IN ('teacher', 'user', 'users', 'role_teacher', 'teacher_role') THEN 'teacher'::public.broadcast_target_type
        WHEN p_target_type IN ('coordinator', 'role_coordinator') THEN 'coordinator'::public.broadcast_target_type
        WHEN p_target_type IN ('student', 'role_student') THEN 'student'::public.broadcast_target_type
        ELSE 'all'::public.broadcast_target_type
      END,
      target_id = CASE WHEN p_target_type = 'group' THEN p_target_id ELSE NULL END
  WHERE id = p_document_id;

  FOREACH tid IN ARRAY v_ids LOOP
    INSERT INTO public.document_recipients (document_id, teacher_id)
    VALUES (p_document_id, tid)
    ON CONFLICT (document_id, teacher_id) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_document_to_target(UUID, TEXT, UUID, UUID[], UUID[]) TO authenticated;
