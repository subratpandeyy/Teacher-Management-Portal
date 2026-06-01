-- EduBridge / Teacher Portal — additive feature schema (do not drop existing columns/tables)

-- ─── profiles (maps to "users") ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS subject TEXT;

-- ─── message templates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── broadcasts (one-to-all; inbox_messages kept for private) ─────────────
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  template_id UUID REFERENCES public.message_templates (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS broadcasts_scheduled_idx ON public.broadcasts (scheduled_for)
  WHERE published_at IS NULL;

CREATE TABLE IF NOT EXISTS public.broadcast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES public.broadcasts (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broadcast_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS broadcast_recipients_teacher_idx ON public.broadcast_recipients (teacher_id);

-- ─── documents: admin-distributed + recipient mapping ───────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Legacy rows keep teacher_id; new shared docs use document_recipients
ALTER TABLE public.documents
  ALTER COLUMN teacher_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.document_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  downloaded_at TIMESTAMPTZ,
  UNIQUE (document_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS document_recipients_teacher_idx ON public.document_recipients (teacher_id);

-- Backfill recipients from legacy per-teacher documents
INSERT INTO public.document_recipients (document_id, teacher_id, assigned_at)
SELECT d.id, d.teacher_id, d.created_at
FROM public.documents d
WHERE d.teacher_id IS NOT NULL
ON CONFLICT (document_id, teacher_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.document_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_downloads_teacher_idx ON public.document_downloads (teacher_id);

-- ─── teacher subjects (many-to-many) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  PRIMARY KEY (teacher_id, subject)
);

-- ─── payments ───────────────────────────────────────────────────────────────
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid');

CREATE TABLE IF NOT EXISTS public.teacher_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  month_year DATE NOT NULL,
  amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  status public.payment_status NOT NULL DEFAULT 'pending',
  invoice_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, month_year)
);

-- ─── session reports ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.session_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  student_name TEXT NOT NULL,
  duration_hours DECIMAL(5, 2) NOT NULL,
  notes TEXT,
  admin_approved BOOLEAN NOT NULL DEFAULT FALSE,
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_reports_teacher_idx ON public.session_reports (teacher_id);

-- ─── availability ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.teacher_unavailability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── audit & reminders ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inactivity_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── scheduled private inbox (additive; existing immediate inbox unchanged) ─
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ─── engagement metrics view ──────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.teacher_engagement_metrics AS
SELECT
  p.id AS teacher_id,
  p.display_name,
  COALESCE(
    ROUND(
      100.0 * COUNT(br.read_at) FILTER (WHERE br.read_at IS NOT NULL)
      / NULLIF(COUNT(br.id), 0),
      1
    ),
    0
  ) AS broadcast_read_rate_pct,
  COALESCE(
    ROUND(
      100.0 * COUNT(DISTINCT dd.document_id)
      / NULLIF(COUNT(DISTINCT dr.document_id), 0),
      1
    ),
    0
  ) AS document_download_rate_pct,
  GREATEST(
    MAX(br.read_at),
    MAX(dd.downloaded_at),
    MAX(cm.created_at)
  ) AS last_active_at,
  COUNT(DISTINCT cm.id) FILTER (
    WHERE cm.sender_id = p.id AND cm.created_at > NOW() - INTERVAL '30 days'
  ) AS chat_messages_30d
FROM public.profiles p
LEFT JOIN public.broadcast_recipients br ON br.teacher_id = p.id
LEFT JOIN public.document_recipients dr ON dr.teacher_id = p.id
LEFT JOIN public.document_downloads dd ON dd.teacher_id = p.id
LEFT JOIN public.conversations c ON c.teacher_id = p.id
LEFT JOIN public.chat_messages cm ON cm.conversation_id = c.id
WHERE p.role = 'teacher'
GROUP BY p.id, p.display_name;

-- ─── RPC: assign document to teachers (single storage file) ─────────────────
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

GRANT EXECUTE ON FUNCTION public.admin_assign_document(UUID, UUID[]) TO authenticated;

-- ─── RPC: teachers list assigned non-expired documents ────────────────────────
CREATE OR REPLACE FUNCTION public.teacher_assigned_documents()
RETURNS TABLE (
  id UUID,
  title TEXT,
  storage_path TEXT,
  mime_type TEXT,
  subject TEXT,
  expires_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  downloaded_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.id,
    d.title,
    d.storage_path,
    d.mime_type,
    d.subject,
    d.expires_at,
    dr.assigned_at,
    dr.downloaded_at
  FROM public.document_recipients dr
  JOIN public.documents d ON d.id = dr.document_id
  WHERE dr.teacher_id = auth.uid()
    AND (d.expires_at IS NULL OR d.expires_at > NOW())
  ORDER BY dr.assigned_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_assigned_documents() TO authenticated;

-- ─── RPC: mark document downloaded ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_document_downloaded(p_document_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.document_recipients
  SET downloaded_at = NOW()
  WHERE document_id = p_document_id AND teacher_id = auth.uid();

  INSERT INTO public.document_downloads (document_id, teacher_id)
  VALUES (p_document_id, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_document_downloaded(UUID) TO authenticated;

-- ─── RPC: publish scheduled broadcasts (called by edge function too) ──────────
CREATE OR REPLACE FUNCTION public.publish_due_broadcasts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  published_count INTEGER := 0;
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT id FROM public.broadcasts
    WHERE published_at IS NULL
      AND scheduled_for IS NOT NULL
      AND scheduled_for <= NOW()
  LOOP
    UPDATE public.broadcasts SET published_at = NOW() WHERE id = rec.id;
    published_count := published_count + 1;
  END LOOP;
  RETURN published_count;
END;
$$;

-- ─── RPC: publish due private inbox messages ────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_due_inbox_messages()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  UPDATE public.inbox_messages
  SET published_at = NOW()
  WHERE published_at IS NULL
    AND scheduled_for IS NOT NULL
    AND scheduled_for <= NOW();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ─── RPC: log audit entry ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_audit(p_action TEXT, p_details JSONB DEFAULT '{}')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  INSERT INTO public.audit_logs (admin_id, action, details)
  VALUES (auth.uid(), p_action, p_details)
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(TEXT, JSONB) TO authenticated;
