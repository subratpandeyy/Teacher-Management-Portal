-- Fix UUID cast error on storage upload + dedicated buckets (documents, attachments, chat-files)
--
-- Root cause: storage_teacher_id_from_path() did split_part(name,'/',1)::UUID
-- Paths like attachments/... or shared/... made policy evaluation throw:
--   invalid input syntax for type uuid: "attachments"

-- ─── Safe path parser (never throws) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.storage_teacher_id_from_path(object_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  seg TEXT;
BEGIN
  seg := split_part(object_name, '/', 1);
  IF seg IS NULL OR seg = '' THEN
    RETURN NULL;
  END IF;
  IF seg !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NULL;
  END IF;
  RETURN seg::UUID;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- ─── Legacy teacher-documents policies (admin + teacher UUID paths only) ─────────
DROP POLICY IF EXISTS storage_teacher_documents_select ON storage.objects;
DROP POLICY IF EXISTS storage_teacher_documents_insert ON storage.objects;
DROP POLICY IF EXISTS storage_teacher_documents_update ON storage.objects;
DROP POLICY IF EXISTS storage_teacher_documents_delete ON storage.objects;

CREATE POLICY storage_teacher_documents_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR (
        public.storage_teacher_id_from_path(name) IS NOT NULL
        AND public.storage_teacher_id_from_path(name) = auth.uid()
      )
      OR (storage.foldername(name))[1] = 'shared'
      OR (storage.foldername(name))[1] = 'attachments'
      OR (storage.foldername(name))[1] = 'chat'
    )
  );

CREATE POLICY storage_teacher_documents_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR (
        public.storage_teacher_id_from_path(name) IS NOT NULL
        AND public.storage_teacher_id_from_path(name) = auth.uid()
      )
    )
  );

CREATE POLICY storage_teacher_documents_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR (
        public.storage_teacher_id_from_path(name) IS NOT NULL
        AND public.storage_teacher_id_from_path(name) = auth.uid()
      )
    )
  );

CREATE POLICY storage_teacher_documents_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR (
        public.storage_teacher_id_from_path(name) IS NOT NULL
        AND public.storage_teacher_id_from_path(name) = auth.uid()
      )
    )
  );

-- ─── Dedicated buckets ─────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', FALSE, 52428800, NULL),
  ('attachments', 'attachments', FALSE, 52428800, NULL),
  ('chat-files', 'chat-files', FALSE, 52428800, NULL)
ON CONFLICT (id) DO NOTHING;

-- documents: {document_id}/{filename}
DROP POLICY IF EXISTS storage_documents_admin_all ON storage.objects;
DROP POLICY IF EXISTS storage_documents_teacher_select ON storage.objects;

CREATE POLICY storage_documents_admin_all ON storage.objects
  FOR ALL
  USING (bucket_id = 'documents' AND public.is_admin())
  WITH CHECK (bucket_id = 'documents' AND public.is_admin());

CREATE POLICY storage_documents_teacher_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1
      FROM public.documents d
      INNER JOIN public.document_recipients dr ON dr.document_id = d.id
      WHERE d.storage_path = name
        AND dr.teacher_id = auth.uid()
    )
  );

-- attachments: {broadcast_id}/{filename}
DROP POLICY IF EXISTS storage_attachments_admin_all ON storage.objects;
DROP POLICY IF EXISTS storage_attachments_teacher_select ON storage.objects;

CREATE POLICY storage_attachments_admin_all ON storage.objects
  FOR ALL
  USING (bucket_id = 'attachments' AND public.is_admin())
  WITH CHECK (bucket_id = 'attachments' AND public.is_admin());

CREATE POLICY storage_attachments_teacher_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1
      FROM public.broadcast_attachments ba
      INNER JOIN public.broadcast_recipients br ON br.broadcast_id = ba.broadcast_id
      WHERE ba.storage_path = name
        AND br.teacher_id = auth.uid()
    )
  );

-- chat-files: {conversation_id}/{segment}/{filename}
DROP POLICY IF EXISTS storage_chat_files_admin_all ON storage.objects;
DROP POLICY IF EXISTS storage_chat_files_participant_insert ON storage.objects;
DROP POLICY IF EXISTS storage_chat_files_participant_select ON storage.objects;

CREATE POLICY storage_chat_files_admin_all ON storage.objects
  FOR ALL
  USING (bucket_id = 'chat-files' AND public.is_admin())
  WITH CHECK (bucket_id = 'chat-files' AND public.is_admin());

CREATE POLICY storage_chat_files_participant_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-files'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::TEXT = (storage.foldername(name))[1]
          AND c.teacher_id = auth.uid()
      )
    )
  );

CREATE POLICY storage_chat_files_participant_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'chat-files'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::TEXT = (storage.foldername(name))[1]
          AND c.teacher_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_messages cm
        INNER JOIN public.conversations c2 ON c2.id = cm.conversation_id
        WHERE cm.attachment_url = name
          AND (c2.teacher_id = auth.uid() OR cm.sender_id = auth.uid())
      )
    )
  );

-- Optional metadata: which bucket a document row uses
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'documents';

ALTER TABLE public.broadcast_attachments
  ADD COLUMN IF NOT EXISTS storage_bucket TEXT NOT NULL DEFAULT 'attachments';

-- ─── Broadcast create with predetermined id (upload attachment before insert) ─
DROP FUNCTION IF EXISTS public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[]);

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
    WHEN p_target_type IN ('group', 'teacher') THEN p_target_id
    ELSE NULL
  END;

  v_teacher_ids := public.resolve_teacher_ids(
    p_target_type, v_safe_target_id, p_teacher_ids, p_group_ids
  );

  IF v_teacher_ids IS NULL OR array_length(v_teacher_ids, 1) IS NULL OR array_length(v_teacher_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No teachers matched the selected target';
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

GRANT EXECUTE ON FUNCTION public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[], UUID) TO authenticated;

-- Register attachment (storage_path is object name inside attachments bucket)
CREATE OR REPLACE FUNCTION public.register_broadcast_attachment(
  p_broadcast_id UUID,
  p_storage_path TEXT,
  p_file_name TEXT,
  p_mime_type TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL,
  p_storage_bucket TEXT DEFAULT 'attachments'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_admin_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_admin_id := auth.uid();

  IF p_storage_path IS NULL OR p_storage_path = '' THEN
    RAISE EXCEPTION 'storage_path is required';
  END IF;

  INSERT INTO public.broadcast_attachments (
    broadcast_id, storage_path, storage_bucket, file_name, mime_type, file_size, uploaded_by
  )
  VALUES (
    p_broadcast_id, p_storage_path, COALESCE(p_storage_bucket, 'attachments'),
    p_file_name, p_mime_type, p_file_size, v_admin_id
  )
  RETURNING id INTO v_id;

  UPDATE public.broadcasts
  SET attachment_url = p_storage_path, attachment_name = p_file_name
  WHERE id = p_broadcast_id;

  RETURN v_id;
END;
$$;

DROP FUNCTION IF EXISTS public.register_broadcast_attachment(UUID, TEXT, TEXT, TEXT, BIGINT);
GRANT EXECUTE ON FUNCTION public.register_broadcast_attachment(UUID, TEXT, TEXT, TEXT, BIGINT, TEXT) TO authenticated;
