-- Migration: Groups Extension, Triggers, RLS Shadowing & coordinator Scope Fixes
-- Date: 2026-06-14

-- ─── 1. Groups Schema Extension ──────────────────────────────────────────────
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS creator_role public.user_role;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'public' CHECK (type IN ('public', 'private'));
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS membership_rules TEXT;

-- ─── 2. Triggers for Groups and Conversations ───────────────────────────────

-- Trigger: Automatically set creator_role BEFORE INSERT
CREATE OR REPLACE FUNCTION public.set_group_creator_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT role INTO NEW.creator_role
  FROM public.profiles
  WHERE id = NEW.created_by;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_group_creator_role ON public.groups;
CREATE TRIGGER trigger_set_group_creator_role
  BEFORE INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.set_group_creator_role();

-- Trigger: Automatically create conversation AFTER INSERT on groups
CREATE OR REPLACE FUNCTION public.handle_new_group_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  INSERT INTO public.conversations (group_id, type, name)
  VALUES (NEW.id, 'group', NEW.name)
  RETURNING id INTO v_conv_id;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv_id, NEW.created_by)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_new_group_conversation ON public.groups;
CREATE TRIGGER trigger_new_group_conversation
  AFTER INSERT ON public.groups
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_group_conversation();

-- Trigger: Automatically sync group members with conversation participants
CREATE OR REPLACE FUNCTION public.handle_group_member_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE group_id = COALESCE(NEW.group_id, OLD.group_id)
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.conversation_participants (conversation_id, profile_id)
      VALUES (v_conv_id, NEW.teacher_id)
      ON CONFLICT DO NOTHING;
    ELSIF TG_OP = 'DELETE' THEN
      DELETE FROM public.conversation_participants
      WHERE conversation_id = v_conv_id AND profile_id = OLD.teacher_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_group_member_change ON public.group_members;
CREATE TRIGGER trigger_group_member_change
  AFTER INSERT OR DELETE ON public.group_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_group_member_change();


-- ─── 3. Profiles and Coordinator Assignment Visibility ───────────────────────

-- Allow anyone to view profiles (resolves chat and list name visibility)
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view active profiles" ON public.profiles;
CREATE POLICY "Anyone can view active profiles" ON public.profiles
  FOR SELECT
  TO authenticated
  USING (deleted_at IS NULL);

-- Allow anyone to see coordinator assignments (resolves scope calculation on clients)
DROP POLICY IF EXISTS "Anyone can view coordinator assignments" ON public.coordinator_assignments;
CREATE POLICY "Anyone can view coordinator assignments" ON public.coordinator_assignments
  FOR SELECT
  TO authenticated
  USING (true);


-- ─── 4. Shadowing Fixes ──────────────────────────────────────────────────────

-- Recreate groups SELECT policy shadowing fix
DROP POLICY IF EXISTS groups_teacher_select_member ON public.groups;
CREATE POLICY groups_teacher_select_member ON public.groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id AND gm.teacher_id = auth.uid()
    )
  );

-- Recreate broadcasts SELECT policy shadowing fix
DROP POLICY IF EXISTS broadcasts_teacher_select ON public.broadcasts;
CREATE POLICY broadcasts_teacher_select ON public.broadcasts
  FOR SELECT USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.broadcast_recipients br
      WHERE br.broadcast_id = broadcasts.id AND br.teacher_id = auth.uid()
    )
  );

-- Recreate documents SELECT policy shadowing fix
DROP POLICY IF EXISTS documents_select_via_recipients ON public.documents;
CREATE POLICY documents_select_via_recipients ON public.documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.document_recipients dr
      WHERE dr.document_id = documents.id AND dr.teacher_id = auth.uid()
    )
    AND (expires_at IS NULL OR expires_at > NOW())
  );


-- ─── 5. Groups RLS Policies ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "groups_select_policy" ON public.groups;
CREATE POLICY "groups_select_policy" ON public.groups
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR type = 'public'
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = groups.id AND gm.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
CREATE POLICY "groups_insert_policy" ON public.groups
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "groups_update_policy" ON public.groups;
CREATE POLICY "groups_update_policy" ON public.groups
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "groups_delete_policy" ON public.groups;
CREATE POLICY "groups_delete_policy" ON public.groups
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());


-- ─── 6. Group Members RLS Policies ───────────────────────────────────────────
DROP POLICY IF EXISTS "group_members_select_policy" ON public.group_members;
CREATE POLICY "group_members_select_policy" ON public.group_members
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_members.group_id
    )
  );

DROP POLICY IF EXISTS "group_members_insert_policy" ON public.group_members;
CREATE POLICY "group_members_insert_policy" ON public.group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      teacher_id = auth.uid() 
      AND EXISTS (
        SELECT 1 FROM public.groups g 
        WHERE g.id = group_id AND g.type = 'public'
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.created_by = auth.uid() AND (
        g.creator_role = 'admin'::public.user_role
        OR (g.creator_role = 'coordinator'::public.user_role AND public.belongs_to_coordinator(teacher_id, auth.uid()))
        OR (g.creator_role = 'teacher'::public.user_role AND EXISTS (
          SELECT 1 FROM public.teacher_student_assignments tsa
          WHERE tsa.teacher_id = auth.uid() AND tsa.student_id = teacher_id
        ))
        OR (g.creator_role = 'student'::public.user_role AND EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = teacher_id AND p.role = 'student'::public.user_role
        ))
      )
    )
  );

DROP POLICY IF EXISTS "group_members_delete_policy" ON public.group_members;
CREATE POLICY "group_members_delete_policy" ON public.group_members
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id AND g.created_by = auth.uid()
    )
  );


-- ─── 7. Chat Messages Policies ───────────────────────────────────────────────
DROP POLICY IF EXISTS chat_messages_teacher_update_own ON public.chat_messages;
CREATE POLICY chat_messages_teacher_update_own ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid() 
    AND deleted_at IS NULL 
    AND public.is_conversation_participant(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid() 
    AND deleted_at IS NULL 
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );

DROP POLICY IF EXISTS chat_messages_teacher_delete_own ON public.chat_messages;
CREATE POLICY chat_messages_teacher_delete_own ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid() 
    AND public.is_conversation_participant(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid() 
    AND public.is_conversation_participant(conversation_id, auth.uid())
  );


-- ─── 8. Tasks Scoped Policies ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coordinators can manage tasks in scope" ON public.tasks;
CREATE POLICY "Coordinators can manage tasks in scope" ON public.tasks
  FOR ALL
  TO authenticated
  USING (
    public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(assigned_to, auth.uid()) OR
      public.belongs_to_coordinator(assigned_by, auth.uid())
    )
  )
  WITH CHECK (
    public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(assigned_to, auth.uid()) OR
      public.belongs_to_coordinator(assigned_by, auth.uid())
    )
  );


-- ─── 9. Attendance Refined Policies ──────────────────────────────────────────
DROP POLICY IF EXISTS "Students can view their own attendance" ON public.attendance;
CREATE POLICY "Students can view their own attendance" ON public.attendance
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid() OR teacher_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Teachers can manage attendance" ON public.attendance;
CREATE POLICY "Teachers can manage attendance" ON public.attendance
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Coordinators can manage attendance in scope" ON public.attendance;
CREATE POLICY "Coordinators can manage attendance in scope" ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(student_id, auth.uid()) OR
      public.belongs_to_coordinator(teacher_id, auth.uid())
    )
  )
  WITH CHECK (
    public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(student_id, auth.uid()) OR
      public.belongs_to_coordinator(teacher_id, auth.uid())
    )
  );


-- ─── 10. Student Progress Refined Policies ───────────────────────────────────
DROP POLICY IF EXISTS "Students can view their own progress" ON public.student_progress;
CREATE POLICY "Students can view their own progress" ON public.student_progress
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid() OR teacher_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Teachers can manage progress" ON public.student_progress;
CREATE POLICY "Teachers can manage progress" ON public.student_progress
  FOR ALL
  TO authenticated
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Coordinators can manage progress in scope" ON public.student_progress;
CREATE POLICY "Coordinators can manage progress in scope" ON public.student_progress
  FOR ALL
  TO authenticated
  USING (
    public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(student_id, auth.uid()) OR
      public.belongs_to_coordinator(teacher_id, auth.uid())
    )
  )
  WITH CHECK (
    public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(student_id, auth.uid()) OR
      public.belongs_to_coordinator(teacher_id, auth.uid())
    )
  );
