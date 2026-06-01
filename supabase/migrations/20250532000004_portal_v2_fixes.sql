-- Portal v2 fixes: broadcast_attachments, multi-group targeting, storage paths, RPC hardening

-- ─── broadcast_attachments (metadata only — storage_path is TEXT, never UUID) ─
CREATE TABLE IF NOT EXISTS public.broadcast_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts (id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  uploaded_by UUID NOT NULL REFERENCES public.profiles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcast_attachments_broadcast_idx ON public.broadcast_attachments (broadcast_id);

ALTER TABLE public.broadcast_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcast_attachments_admin_all ON public.broadcast_attachments;
CREATE POLICY broadcast_attachments_admin_all ON public.broadcast_attachments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS broadcast_attachments_teacher_select ON public.broadcast_attachments;
CREATE POLICY broadcast_attachments_teacher_select ON public.broadcast_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.broadcast_recipients br
      WHERE br.broadcast_id = broadcast_attachments.broadcast_id
        AND br.teacher_id = auth.uid()
    )
  );

-- ─── Resolve teachers (all | one group | many groups | explicit teacher IDs) ─
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
  IF p_explicit_ids IS NOT NULL AND array_length(p_explicit_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT t) INTO ids FROM unnest(p_explicit_ids) AS t;
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    SELECT array_agg(DISTINCT gm.teacher_id) INTO ids
    FROM public.group_members gm
    WHERE gm.group_id = ANY (p_group_ids);
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  IF p_target_type = 'all' THEN
    SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'teacher';
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  IF p_target_type = 'group' AND p_target_id IS NOT NULL THEN
    SELECT array_agg(DISTINCT teacher_id) INTO ids
    FROM public.group_members WHERE group_id = p_target_id;
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  IF p_target_type = 'teacher' AND p_target_id IS NOT NULL THEN
    RETURN ARRAY[p_target_id];
  END IF;

  RETURN ARRAY[]::UUID[];
END;
$$;

DROP FUNCTION IF EXISTS public.resolve_teacher_ids(public.broadcast_target_type, UUID, UUID[]);
GRANT EXECUTE ON FUNCTION public.resolve_teacher_ids(public.broadcast_target_type, UUID, UUID[], UUID[]) TO authenticated;

-- ─── Register attachment after storage upload (storage_path must be TEXT path) ─
CREATE OR REPLACE FUNCTION public.register_broadcast_attachment(
  p_broadcast_id UUID,
  p_storage_path TEXT,
  p_file_name TEXT,
  p_mime_type TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL
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

  IF p_storage_path ~ '^[0-9a-f]{8}-' AND length(p_storage_path) < 36 THEN
  -- paths should look like attachments/broadcasts/{uuid}/file.pdf not bare uuids
    NULL;
  END IF;

  INSERT INTO public.broadcast_attachments (
    broadcast_id, storage_path, file_name, mime_type, file_size, uploaded_by
  )
  VALUES (
    p_broadcast_id, p_storage_path, p_file_name, p_mime_type, p_file_size, v_admin_id
  )
  RETURNING id INTO v_id;

  UPDATE public.broadcasts
  SET attachment_url = p_storage_path, attachment_name = p_file_name
  WHERE id = p_broadcast_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_broadcast_attachment(UUID, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

-- ─── Create broadcast + recipients (never put storage paths in target_id) ─────
DROP FUNCTION IF EXISTS public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.admin_create_broadcast(
  p_title TEXT,
  p_message TEXT,
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_teacher_ids UUID[] DEFAULT NULL,
  p_group_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
  v_broadcast_id UUID;
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
    admin_id, created_by, title, body, message,
    target_type, target_id, published_at
  )
  VALUES (
    v_admin_id, v_admin_id, p_title, p_message, p_message,
    p_target_type, v_safe_target_id, NOW()
  )
  RETURNING id INTO v_broadcast_id;

  FOREACH v_tid IN ARRAY v_teacher_ids LOOP
    INSERT INTO public.broadcast_recipients (broadcast_id, teacher_id)
    VALUES (v_broadcast_id, v_tid)
    ON CONFLICT (broadcast_id, teacher_id) DO NOTHING;
  END LOOP;

  RETURN v_broadcast_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], UUID[]) TO authenticated;

-- ─── Teacher inbox with attachments JSON ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.teacher_my_broadcasts();

CREATE FUNCTION public.teacher_my_broadcasts()
RETURNS TABLE (
  recipient_id UUID,
  broadcast_id UUID,
  title TEXT,
  message TEXT,
  body TEXT,
  published_at TIMESTAMPTZ,
  attachment_url TEXT,
  attachment_name TEXT,
  attachments JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    br.id,
    b.id,
    b.title,
    COALESCE(b.message, b.body),
    b.body,
    b.published_at,
    b.attachment_url,
    b.attachment_name,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ba.id,
            'storage_path', ba.storage_path,
            'file_name', ba.file_name,
            'mime_type', ba.mime_type
          )
          ORDER BY ba.created_at
        )
        FROM public.broadcast_attachments ba
        WHERE ba.broadcast_id = b.id
      ),
      '[]'::jsonb
    ),
    br.read_at,
    b.created_at
  FROM public.broadcast_recipients br
  INNER JOIN public.broadcasts b ON b.id = br.broadcast_id
  WHERE br.teacher_id = auth.uid()
    AND b.published_at IS NOT NULL
  ORDER BY b.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_my_broadcasts() TO authenticated;

-- ─── Documents: multi-group assign ────────────────────────────────────────────
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

DROP FUNCTION IF EXISTS public.admin_assign_document_to_target(UUID, public.document_target_type, UUID, UUID[]);
GRANT EXECUTE ON FUNCTION public.admin_assign_document_to_target(UUID, public.document_target_type, UUID, UUID[], UUID[]) TO authenticated;

-- ─── Chat: bump updated_at on edit ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.chat_messages_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_updated ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_updated
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_messages_touch_updated_at();

-- ─── Feedback touch updated_at ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.broadcast_feedback_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS broadcast_feedback_touch_updated ON public.broadcast_feedback;
CREATE TRIGGER broadcast_feedback_touch_updated
  BEFORE UPDATE ON public.broadcast_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.broadcast_feedback_touch_updated_at();

-- Realtime
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_attachments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
