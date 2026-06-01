-- Portal audit: chat storage paths, attachment_type, documents, conversations, feedback indexes

-- ─── chat_messages: attachment metadata ───────────────────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_type TEXT;

COMMENT ON COLUMN public.chat_messages.attachment_url IS 'Supabase Storage path in teacher-documents bucket';
COMMENT ON COLUMN public.chat_messages.attachment_type IS 'MIME type of attachment when present';

-- ─── documents: optional description (file_url = storage_path in app layer) ───
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ─── Ensure teacher conversation exists (legacy teachers without row) ─────────
CREATE OR REPLACE FUNCTION public.ensure_teacher_conversation(p_teacher_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'teacher_id required';
  END IF;

  IF auth.uid() IS DISTINCT FROM p_teacher_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_id FROM public.conversations WHERE teacher_id = p_teacher_id LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (teacher_id) VALUES (p_teacher_id) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_teacher_conversation(UUID) TO authenticated;

-- ─── Teacher assigned documents (canonical) ───────────────────────────────────
DROP FUNCTION IF EXISTS public.teacher_assigned_documents();

CREATE FUNCTION public.teacher_assigned_documents()
RETURNS TABLE (
  id UUID,
  title TEXT,
  file_name TEXT,
  storage_path TEXT,
  mime_type TEXT,
  description TEXT,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.title,
    COALESCE(d.file_name, d.title),
    d.storage_path,
    d.mime_type,
    d.description,
    dr.assigned_at,
    d.created_at
  FROM public.document_recipients dr
  INNER JOIN public.documents d ON d.id = dr.document_id
  WHERE dr.teacher_id = auth.uid()
    AND d.direction = 'admin_to_teacher'
  ORDER BY dr.assigned_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_assigned_documents() TO authenticated;

-- ─── Document assign: fail loudly when no recipients ──────────────────────────
CREATE OR REPLACE FUNCTION public.admin_assign_document_to_target(
  p_document_id UUID,
  p_target_type public.document_target_type,
  p_target_id UUID DEFAULT NULL,
  p_teacher_ids UUID[] DEFAULT NULL,
  p_group_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_broadcast_target public.broadcast_target_type;
  v_inserted INTEGER := 0;
  tid UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_broadcast_target := p_target_type::TEXT::public.broadcast_target_type;
  v_ids := public.resolve_teacher_ids(v_broadcast_target, p_target_id, p_teacher_ids, p_group_ids);

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No teachers matched the selected target';
  END IF;

  UPDATE public.documents
  SET target_type = p_target_type,
      target_id = CASE WHEN p_target_type IN ('group', 'teacher') THEN p_target_id ELSE NULL END
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

GRANT EXECUTE ON FUNCTION public.admin_assign_document_to_target(UUID, public.document_target_type, UUID, UUID[], UUID[]) TO authenticated;

-- ─── Feedback: enforce lookup by broadcast ────────────────────────────────────
CREATE INDEX IF NOT EXISTS broadcast_feedback_broadcast_teacher_idx
  ON public.broadcast_feedback (broadcast_id, teacher_id);

-- ─── Storage: attachments/chat/{conversation_id}/... ────────────────────────
DROP POLICY IF EXISTS storage_chat_attachments_v2_insert ON storage.objects;
DROP POLICY IF EXISTS storage_chat_attachments_v2_select ON storage.objects;

CREATE POLICY storage_chat_attachments_v2_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'attachments'
    AND (storage.foldername(name))[2] = 'chat'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::TEXT = (storage.foldername(name))[3]
          AND c.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY storage_chat_attachments_v2_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'attachments'
    AND (storage.foldername(name))[2] = 'chat'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::TEXT = (storage.foldername(name))[3]
          AND c.teacher_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_messages cm
        WHERE cm.attachment_url = name
          AND (
            cm.sender_id = auth.uid()
            OR cm.receiver_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.conversations c2
              WHERE c2.id = cm.conversation_id
                AND c2.teacher_id = auth.uid()
            )
          )
      )
    )
  );
