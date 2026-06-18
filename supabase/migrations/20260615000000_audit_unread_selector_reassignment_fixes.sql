-- Migration: Audit Logs, document RLS, unread badges, and upgraded recipient selector
-- Date: 2026-06-15

-- ─── 1. Add last_read_at to conversation_participants ──────────────────────────
ALTER TABLE public.conversation_participants ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

-- ─── 2. Create assignment_audit_logs ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assignment_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assigned_type TEXT NOT NULL CHECK (assigned_type IN ('teacher', 'student')),
  target_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  new_coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.assignment_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins have full access on assignment_audit_logs" ON public.assignment_audit_logs;
CREATE POLICY "Admins have full access on assignment_audit_logs"
  ON public.assignment_audit_logs
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── 3. Trigger for logging coordinator reassignments ──────────────────────────
CREATE OR REPLACE FUNCTION public.log_coordinator_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_prev_coord_id UUID;
  v_assigned_type TEXT;
  v_target_id UUID;
BEGIN
  -- Determine type and target
  IF NEW.teacher_id IS NOT NULL THEN
    v_assigned_type := 'teacher';
    v_target_id := NEW.teacher_id;
    
    -- Find latest coordinator_id before this one
    SELECT coordinator_id INTO v_prev_coord_id
    FROM public.coordinator_assignments
    WHERE teacher_id = NEW.teacher_id AND id <> NEW.id
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    v_assigned_type := 'student';
    v_target_id := NEW.student_id;
    
    -- Find latest coordinator_id before this one
    SELECT coordinator_id INTO v_prev_coord_id
    FROM public.coordinator_assignments
    WHERE student_id = NEW.student_id AND id <> NEW.id
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  -- Only log if the coordinator actually changed (or if this is the first assignment)
  IF v_prev_coord_id IS DISTINCT FROM NEW.coordinator_id THEN
    INSERT INTO public.assignment_audit_logs (
      assigned_type,
      target_id,
      previous_coordinator_id,
      new_coordinator_id,
      changed_by
    ) VALUES (
      v_assigned_type,
      v_target_id,
      v_prev_coord_id,
      NEW.coordinator_id,
      COALESCE(auth.uid(), NEW.coordinator_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_coordinator_assignment_change ON public.coordinator_assignments;
CREATE TRIGGER trigger_log_coordinator_assignment_change
  AFTER INSERT ON public.coordinator_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.log_coordinator_assignment_change();

-- ─── 4. Recipient Selector SQL Resolver ──────────────────────────────────────────
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
  -- Get document uploader
  SELECT uploaded_by INTO v_uploaded_by FROM public.documents WHERE id = p_document_id;
  IF v_uploaded_by IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;

  -- Check if caller is admin OR the one who uploaded the document
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
  IF auth.uid() <> v_uploaded_by AND v_caller_role <> 'admin'::public.user_role THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Resolve target IDs
  IF p_target_type = 'all' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE deleted_at IS NULL;
  ELSIF p_target_type = 'role_student' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE role = 'student'::public.user_role AND deleted_at IS NULL;
  ELSIF p_target_type = 'role_teacher' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE role = 'teacher'::public.user_role AND deleted_at IS NULL;
  ELSIF p_target_type = 'role_coordinator' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.profiles WHERE role = 'coordinator'::public.user_role AND deleted_at IS NULL;
  ELSIF p_target_type = 'group' AND p_target_id IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT teacher_id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.group_members WHERE group_id = p_target_id;
  ELSIF p_target_type = 'groups' AND p_group_ids IS NOT NULL THEN
    SELECT COALESCE(array_agg(DISTINCT teacher_id), ARRAY[]::UUID[]) INTO v_ids
    FROM public.group_members WHERE group_id = ANY(p_group_ids);
  ELSIF (p_target_type = 'teacher' OR p_target_type = 'user') AND p_teacher_ids IS NOT NULL THEN
    v_ids := p_teacher_ids;
  ELSE
    v_ids := ARRAY[]::UUID[];
  END IF;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No recipients matched the selected target';
  END IF;

  -- Update document target fields
  UPDATE public.documents
  SET target_type = CASE 
        WHEN p_target_type = 'group' THEN 'group'::public.broadcast_target_type
        WHEN p_target_type = 'groups' THEN 'group'::public.broadcast_target_type
        WHEN p_target_type = 'teacher' THEN 'teacher'::public.broadcast_target_type
        WHEN p_target_type = 'user' THEN 'teacher'::public.broadcast_target_type
        ELSE 'all'::public.broadcast_target_type
      END,
      target_id = CASE WHEN p_target_type IN ('group', 'teacher') THEN p_target_id ELSE NULL END
  WHERE id = p_document_id;

  -- Insert recipients
  FOREACH tid IN ARRAY v_ids LOOP
    INSERT INTO public.document_recipients (document_id, teacher_id)
    VALUES (p_document_id, tid)
    ON CONFLICT (document_id, teacher_id) DO NOTHING;
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ─── 5. Document RLS Recursion Helpers ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_view_document(p_document_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_role public.user_role;
  v_uploaded_by UUID;
  v_teacher_id UUID;
  v_direction public.document_direction;
BEGIN
  -- Admin check
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  SELECT uploaded_by, teacher_id, direction 
  INTO v_uploaded_by, v_teacher_id, v_direction
  FROM public.documents WHERE id = p_document_id;

  -- If I uploaded it
  IF v_uploaded_by = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- If it's teacher_to_admin and I am the teacher
  IF v_teacher_id = p_user_id AND v_direction = 'teacher_to_admin'::public.document_direction THEN
    RETURN TRUE;
  END IF;

  -- Coordinator check
  IF v_role = 'coordinator'::public.user_role THEN
    IF v_uploaded_by = p_user_id THEN
      RETURN TRUE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.document_recipients dr
      WHERE dr.document_id = p_document_id
        AND public.belongs_to_coordinator(dr.teacher_id, p_user_id)
    );
  END IF;

  -- General recipient check
  RETURN EXISTS (
    SELECT 1 FROM public.document_recipients dr
    WHERE dr.document_id = p_document_id AND dr.teacher_id = p_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.can_view_document_recipient(p_recipient_row_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_role public.user_role;
  v_document_id UUID;
  v_recipient_id UUID;
  v_uploaded_by UUID;
BEGIN
  -- Admin check
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  SELECT document_id, teacher_id INTO v_document_id, v_recipient_id
  FROM public.document_recipients WHERE id = p_recipient_row_id;

  -- If I am the recipient
  IF v_recipient_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- If I uploaded the document
  SELECT uploaded_by INTO v_uploaded_by FROM public.documents WHERE id = v_document_id;
  IF v_uploaded_by = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- Coordinator check
  IF v_role = 'coordinator'::public.user_role THEN
    RETURN public.belongs_to_coordinator(v_recipient_id, p_user_id);
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_modify_document_recipients(p_document_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_uploaded_by UUID;
  v_role public.user_role;
BEGIN
  -- Admin check
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  -- Get document creator
  SELECT uploaded_by INTO v_uploaded_by FROM public.documents WHERE id = p_document_id;
  RETURN v_uploaded_by = p_user_id;
END;
$$;

-- ─── 6. Apply Refactored Document Policies ──────────────────────────────────────────
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_select_via_recipients" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;
DROP POLICY IF EXISTS "Admins have full access on documents" ON public.documents;
DROP POLICY IF EXISTS "Coordinators can read documents in scope" ON public.documents;
DROP POLICY IF EXISTS "documents_select_policy" ON public.documents;

CREATE POLICY "documents_select_policy" ON public.documents
  FOR SELECT TO authenticated USING (public.can_view_document(id, auth.uid()));

DROP POLICY IF EXISTS "documents_insert_policy" ON public.documents;

CREATE POLICY "documents_insert_policy" ON public.documents
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "documents_update_policy" ON public.documents;

CREATE POLICY "documents_update_policy" ON public.documents
  FOR UPDATE TO authenticated USING (uploaded_by = auth.uid()) WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "documents_delete_policy" ON public.documents;

CREATE POLICY "documents_delete_policy" ON public.documents
  FOR DELETE TO authenticated USING (uploaded_by = auth.uid() OR public.is_admin());


DROP POLICY IF EXISTS "document_recipients_admin_all" ON public.document_recipients;
DROP POLICY IF EXISTS "document_recipients_teacher_select" ON public.document_recipients;
DROP POLICY IF EXISTS "Coordinators can read document_recipients in scope" ON public.document_recipients;
DROP POLICY IF EXISTS "document_recipients_select_policy" ON public.document_recipients;

CREATE POLICY "document_recipients_select_policy" ON public.document_recipients
  FOR SELECT TO authenticated USING (public.can_view_document_recipient(id, auth.uid()));

DROP POLICY IF EXISTS "document_recipients_insert_policy" ON public.document_recipients;

CREATE POLICY "document_recipients_insert_policy" ON public.document_recipients
  FOR INSERT TO authenticated WITH CHECK (public.can_modify_document_recipients(document_id, auth.uid()));

DROP POLICY IF EXISTS "document_recipients_delete_policy" ON public.document_recipients;

CREATE POLICY "document_recipients_delete_policy" ON public.document_recipients
  FOR DELETE TO authenticated USING (public.can_modify_document_recipients(document_id, auth.uid()));


-- ─── 7. Group Creation & Management Policies Fix ──────────────────────────────────────────
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
CREATE POLICY "groups_insert_policy" ON public.groups
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid() AND (public.has_role('admin') OR public.has_role('coordinator'))
  );

-- Recreate group member helper functions to enforce role creator checks
CREATE OR REPLACE FUNCTION public.can_add_group_member(p_group_id UUID, p_member_id UUID, p_user_id UUID)
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

  -- Admin bypass
  IF v_user_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  -- Get group metadata
  SELECT created_by, creator_role, type INTO v_creator_id, v_creator_role, v_group_type
  FROM public.groups
  WHERE id = p_group_id;

  IF v_creator_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Self-joining a public group
  IF p_member_id = p_user_id AND v_group_type = 'public' THEN
    RETURN TRUE;
  END IF;

  -- Creator-based addition rules (Only admins & coordinators can add others)
  IF v_creator_id = p_user_id THEN
    -- Coordinator: can add assigned teachers or students in scope
    IF v_creator_role = 'coordinator'::public.user_role THEN
      RETURN public.belongs_to_coordinator(p_member_id, p_user_id);
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_remove_group_member(p_group_id UUID, p_member_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_creator_id UUID;
  v_user_role public.user_role;
  v_creator_role public.user_role;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;
  IF v_user_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  -- Self-leaving group
  IF p_member_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- Creator management (Only coordinators or admins can remove others)
  SELECT created_by INTO v_creator_id FROM public.groups WHERE id = p_group_id;
  IF v_creator_id = p_user_id THEN
    SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_creator_id;
    IF v_creator_role IN ('admin'::public.user_role, 'coordinator'::public.user_role) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;


-- ─── 8. Mark Conversation as Read RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_conversation_as_read(p_conversation_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  UPDATE public.conversation_participants
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id AND profile_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_as_read(UUID, UUID) TO authenticated;


-- ─── 9. Get User Conversations with Unread counts RPC ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_conversations_with_unread(p_user_id UUID)
RETURNS TABLE (
  conversation_id UUID,
  name TEXT,
  type TEXT,
  group_id UUID,
  latest_message_body TEXT,
  latest_message_created_at TIMESTAMPTZ,
  latest_message_sender_name TEXT,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  -- Verify caller is the user themselves or an admin
  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH user_convs AS (
    -- Get all conversations the user is a participant in
    SELECT cp.conversation_id, cp.last_read_at, c.type, c.group_id, c.name as conv_name
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE cp.profile_id = p_user_id
  ),
  latest_msgs AS (
    -- For each conversation, get the latest message
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.body,
      m.created_at,
      p.display_name as sender_name
    FROM public.chat_messages m
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  counts AS (
    -- For each conversation, count unread messages
    SELECT m.conversation_id, COUNT(*) as cnt
    FROM public.chat_messages m
    JOIN user_convs uc ON uc.conversation_id = m.conversation_id
    WHERE m.sender_id <> p_user_id
      AND m.deleted_at IS NULL
      AND m.created_at > COALESCE(uc.last_read_at, '-infinity'::timestamptz)
    GROUP BY m.conversation_id
  )
  SELECT
    uc.conversation_id,
    COALESCE(
      CASE WHEN uc.type = 'direct' THEN
        (SELECT p.display_name FROM public.conversation_participants cp2
         JOIN public.profiles p ON p.id = cp2.profile_id
         WHERE cp2.conversation_id = uc.conversation_id AND cp2.profile_id <> p_user_id LIMIT 1)
      ELSE
        (SELECT g.name FROM public.groups g WHERE g.id = uc.group_id)
      END,
      uc.conv_name,
      'Chat'
    )::TEXT as name,
    uc.type::TEXT,
    uc.group_id,
    lm.body::TEXT as latest_message_body,
    lm.created_at as latest_message_created_at,
    lm.sender_name::TEXT as latest_message_sender_name,
    COALESCE(cnts.cnt, 0::bigint) as unread_count
  FROM user_convs uc
  LEFT JOIN latest_msgs lm ON lm.conversation_id = uc.conversation_id
  LEFT JOIN counts cnts ON cnts.conversation_id = uc.conversation_id
  ORDER BY COALESCE(lm.created_at, '-infinity'::timestamptz) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversations_with_unread(UUID) TO authenticated;
