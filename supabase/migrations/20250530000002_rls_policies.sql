-- Row Level Security (primary defense)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Profiles: own row only, or admin reads all (no cross-teacher PII in API)
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY profiles_admin_update ON public.profiles
  FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Documents
CREATE POLICY documents_select ON public.documents
  FOR SELECT
  USING (teacher_id = auth.uid() OR public.is_admin());

CREATE POLICY documents_insert ON public.documents
  FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY documents_update ON public.documents
  FOR UPDATE
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

CREATE POLICY documents_delete ON public.documents
  FOR DELETE
  USING (teacher_id = auth.uid() OR public.is_admin());

-- Inbox
CREATE POLICY inbox_select ON public.inbox_messages
  FOR SELECT
  USING (teacher_id = auth.uid() OR public.is_admin());

CREATE POLICY inbox_insert_admin ON public.inbox_messages
  FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY inbox_update ON public.inbox_messages
  FOR UPDATE
  USING (teacher_id = auth.uid() OR public.is_admin())
  WITH CHECK (teacher_id = auth.uid() OR public.is_admin());

-- Conversations
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT
  USING (teacher_id = auth.uid() OR public.is_admin());

-- Chat messages (via conversation ownership)
CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.teacher_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.teacher_id = auth.uid() OR public.is_admin())
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
