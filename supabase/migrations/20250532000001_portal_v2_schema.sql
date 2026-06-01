-- Portal v2: groups, fixed broadcasts, feedback, document targets, chat CRUD fields

-- ─── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.broadcast_target_type AS ENUM ('all', 'group', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.document_target_type AS ENUM ('all', 'group', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Groups ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS group_members_teacher_idx ON public.group_members (teacher_id);
CREATE INDEX IF NOT EXISTS group_members_group_idx ON public.group_members (group_id);

-- ─── Broadcasts (extend existing) ─────────────────────────────────────────────
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS message TEXT,
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS target_type public.broadcast_target_type,
  ADD COLUMN IF NOT EXISTS target_id UUID,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles (id);

UPDATE public.broadcasts
SET message = body
WHERE message IS NULL AND body IS NOT NULL;

UPDATE public.broadcasts
SET created_by = admin_id
WHERE created_by IS NULL AND admin_id IS NOT NULL;

UPDATE public.broadcasts
SET target_type = 'teacher'
WHERE target_type IS NULL;

-- ─── Broadcast feedback ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.broadcast_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  feedback_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS broadcast_feedback_broadcast_idx ON public.broadcast_feedback (broadcast_id);

-- ─── Documents metadata ───────────────────────────────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS target_type public.document_target_type,
  ADD COLUMN IF NOT EXISTS target_id UUID;

UPDATE public.documents SET file_name = title WHERE file_name IS NULL;

ALTER TABLE public.document_recipients
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NOW();

-- ─── Chat message extensions (keep conversation model) ────────────────────────
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS receiver_id UUID REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Backfill receiver_id from conversation
UPDATE public.chat_messages cm
SET receiver_id = CASE
  WHEN cm.sender_id = c.teacher_id THEN (
    SELECT p.id FROM public.profiles p WHERE p.role = 'admin' LIMIT 1
  )
  ELSE c.teacher_id
END
FROM public.conversations c
WHERE cm.conversation_id = c.id AND cm.receiver_id IS NULL;

CREATE OR REPLACE FUNCTION public.chat_messages_set_receiver()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_teacher_id UUID;
  v_admin_id UUID;
BEGIN
  SELECT teacher_id INTO v_teacher_id
  FROM public.conversations WHERE id = NEW.conversation_id;

  IF v_teacher_id IS NULL THEN
    RAISE EXCEPTION 'Invalid conversation';
  END IF;

  IF NEW.sender_id = v_teacher_id THEN
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
    NEW.receiver_id := v_admin_id;
  ELSE
    NEW.receiver_id := v_teacher_id;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_before_insert ON public.chat_messages;
CREATE TRIGGER chat_messages_before_insert
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_messages_set_receiver();

-- ─── Resolve teacher IDs for targeting ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_teacher_ids(
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_explicit_ids UUID[] DEFAULT NULL
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
    RETURN p_explicit_ids;
  END IF;

  IF p_target_type = 'all' THEN
    SELECT array_agg(id) INTO ids FROM public.profiles WHERE role = 'teacher';
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  IF p_target_type = 'group' AND p_target_id IS NOT NULL THEN
    SELECT array_agg(teacher_id) INTO ids
    FROM public.group_members WHERE group_id = p_target_id;
    RETURN COALESCE(ids, ARRAY[]::UUID[]);
  END IF;

  IF p_target_type = 'teacher' AND p_target_id IS NOT NULL THEN
    RETURN ARRAY[p_target_id];
  END IF;

  RETURN ARRAY[]::UUID[];
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_teacher_ids(public.broadcast_target_type, UUID, UUID[]) TO authenticated;

-- ─── Admin: create broadcast + recipients (atomic, fixes silent failures) ─────
CREATE OR REPLACE FUNCTION public.admin_create_broadcast(
  p_title TEXT,
  p_message TEXT,
  p_target_type public.broadcast_target_type,
  p_target_id UUID DEFAULT NULL,
  p_teacher_ids UUID[] DEFAULT NULL,
  p_attachment_url TEXT DEFAULT NULL,
  p_attachment_name TEXT DEFAULT NULL
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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_admin_id := auth.uid();
  v_teacher_ids := public.resolve_teacher_ids(p_target_type, p_target_id, p_teacher_ids);

  IF array_length(v_teacher_ids, 1) IS NULL OR array_length(v_teacher_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No teachers matched the selected target';
  END IF;

  INSERT INTO public.broadcasts (
    admin_id, created_by, title, body, message,
    attachment_url, attachment_name,
    target_type, target_id, published_at
  )
  VALUES (
    v_admin_id, v_admin_id, p_title, p_message, p_message,
    p_attachment_url, p_attachment_name,
    p_target_type, p_target_id, NOW()
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

GRANT EXECUTE ON FUNCTION public.admin_create_broadcast(TEXT, TEXT, public.broadcast_target_type, UUID, UUID[], TEXT, TEXT) TO authenticated;

-- ─── Teacher: fetch broadcasts (bypasses PostgREST embed + RLS join issues) ───
CREATE OR REPLACE FUNCTION public.teacher_my_broadcasts()
RETURNS TABLE (
  recipient_id UUID,
  broadcast_id UUID,
  title TEXT,
  message TEXT,
  body TEXT,
  published_at TIMESTAMPTZ,
  attachment_url TEXT,
  attachment_name TEXT,
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
    br.read_at,
    b.created_at
  FROM public.broadcast_recipients br
  INNER JOIN public.broadcasts b ON b.id = br.broadcast_id
  WHERE br.teacher_id = auth.uid()
    AND b.published_at IS NOT NULL
  ORDER BY b.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_my_broadcasts() TO authenticated;

-- ─── Mark broadcast read ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_broadcast_read(p_recipient_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.broadcast_recipients
  SET read_at = NOW()
  WHERE id = p_recipient_id AND teacher_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_broadcast_read(UUID) TO authenticated;

-- ─── Admin assign document to targets ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_assign_document(
  p_document_id UUID,
  p_teacher_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
  tid UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOREACH tid IN ARRAY p_teacher_ids LOOP
    INSERT INTO public.document_recipients (document_id, teacher_id)
    VALUES (p_document_id, tid)
    ON CONFLICT (document_id, teacher_id) DO NOTHING;
    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_assign_document_to_target(
  p_document_id UUID,
  p_target_type public.document_target_type,
  p_target_id UUID DEFAULT NULL,
  p_teacher_ids UUID[] DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
  v_broadcast_target public.broadcast_target_type;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_broadcast_target := p_target_type::TEXT::public.broadcast_target_type;
  v_ids := public.resolve_teacher_ids(v_broadcast_target, p_target_id, p_teacher_ids);

  UPDATE public.documents
  SET target_type = p_target_type, target_id = p_target_id
  WHERE id = p_document_id;

  RETURN public.admin_assign_document(p_document_id, v_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assign_document_to_target(UUID, public.document_target_type, UUID, UUID[]) TO authenticated;

-- ─── Teacher assigned documents (reliable) ────────────────────────────────────
DROP FUNCTION IF EXISTS public.teacher_assigned_documents();

CREATE FUNCTION public.teacher_assigned_documents()
RETURNS TABLE (
  id UUID,
  title TEXT,
  file_name TEXT,
  storage_path TEXT,
  mime_type TEXT,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.title, COALESCE(d.file_name, d.title), d.storage_path, d.mime_type,
         dr.assigned_at, d.created_at
  FROM public.document_recipients dr
  INNER JOIN public.documents d ON d.id = dr.document_id
  WHERE dr.teacher_id = auth.uid()
    AND d.direction = 'admin_to_teacher'
  ORDER BY dr.assigned_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_assigned_documents() TO authenticated;

-- ─── Realtime ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_feedback;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
