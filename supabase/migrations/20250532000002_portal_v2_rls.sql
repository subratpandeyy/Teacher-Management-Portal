-- Portal v2 RLS

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_feedback ENABLE ROW LEVEL SECURITY;

-- ─── Groups (admin full; teachers see own membership only) ────────────────────
DROP POLICY IF EXISTS groups_admin_all ON public.groups;
CREATE POLICY groups_admin_all ON public.groups
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS groups_teacher_select_member ON public.groups;
CREATE POLICY groups_teacher_select_member ON public.groups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = id AND gm.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS group_members_admin_all ON public.group_members;
CREATE POLICY group_members_admin_all ON public.group_members
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS group_members_teacher_select_own ON public.group_members;
CREATE POLICY group_members_teacher_select_own ON public.group_members
  FOR SELECT USING (teacher_id = auth.uid());

-- ─── Broadcast feedback ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS broadcast_feedback_admin_select ON public.broadcast_feedback;
CREATE POLICY broadcast_feedback_admin_select ON public.broadcast_feedback
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS broadcast_feedback_teacher_select_own ON public.broadcast_feedback;
CREATE POLICY broadcast_feedback_teacher_select_own ON public.broadcast_feedback
  FOR SELECT USING (teacher_id = auth.uid());

DROP POLICY IF EXISTS broadcast_feedback_teacher_insert ON public.broadcast_feedback;
CREATE POLICY broadcast_feedback_teacher_insert ON public.broadcast_feedback
  FOR INSERT WITH CHECK (
    teacher_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.broadcast_recipients br
      WHERE br.broadcast_id = broadcast_feedback.broadcast_id
        AND br.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS broadcast_feedback_teacher_update_own ON public.broadcast_feedback;
CREATE POLICY broadcast_feedback_teacher_update_own ON public.broadcast_feedback
  FOR UPDATE USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS broadcast_feedback_teacher_delete_own ON public.broadcast_feedback;
CREATE POLICY broadcast_feedback_teacher_delete_own ON public.broadcast_feedback
  FOR DELETE USING (teacher_id = auth.uid());

-- ─── Documents: teachers read-only (no upload) ───────────────────────────────
DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents
  FOR INSERT WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS documents_teacher_delete_own ON public.documents;
DROP POLICY IF EXISTS documents_delete ON public.documents;
CREATE POLICY documents_delete ON public.documents
  FOR DELETE USING (public.is_admin());

DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents
  FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.document_recipients dr
      WHERE dr.document_id = id AND dr.teacher_id = auth.uid()
    )
  );

-- ─── Chat: teachers edit/delete own messages ──────────────────────────────────
DROP POLICY IF EXISTS chat_messages_teacher_update_own ON public.chat_messages;
CREATE POLICY chat_messages_teacher_update_own ON public.chat_messages
  FOR UPDATE USING (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.teacher_id = auth.uid()
    )
  )
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_teacher_delete_own ON public.chat_messages;
CREATE POLICY chat_messages_teacher_delete_own ON public.chat_messages
  FOR UPDATE USING (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id AND c.teacher_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS chat_messages_admin_update ON public.chat_messages;
CREATE POLICY chat_messages_admin_update ON public.chat_messages
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ─── Profiles: teachers only see self ─────────────────────────────────────────
DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());
