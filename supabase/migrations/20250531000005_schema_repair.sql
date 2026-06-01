-- Idempotent repair: safe to re-run if migrations partially applied or code/DB drifted

ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS subject TEXT;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES public.profiles (id),
  ADD COLUMN IF NOT EXISTS subject TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS batch_id UUID;

DO $$
BEGIN
  ALTER TABLE public.documents ALTER COLUMN teacher_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- teacher_assigned_documents: include legacy rows + recipient rows
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
  SELECT d.id, d.title, d.storage_path, d.mime_type, d.subject, d.expires_at,
         dr.assigned_at, dr.downloaded_at
  FROM public.document_recipients dr
  JOIN public.documents d ON d.id = dr.document_id
  WHERE dr.teacher_id = auth.uid()
    AND (d.expires_at IS NULL OR d.expires_at > NOW())
  UNION ALL
  SELECT d.id, d.title, d.storage_path, d.mime_type, d.subject, d.expires_at,
         d.created_at, NULL::timestamptz
  FROM public.documents d
  WHERE d.teacher_id = auth.uid()
    AND (d.expires_at IS NULL OR d.expires_at > NOW())
    AND NOT EXISTS (
      SELECT 1 FROM public.document_recipients dr2
      WHERE dr2.document_id = d.id AND dr2.teacher_id = auth.uid()
    )
  ORDER BY assigned_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_assigned_documents() TO authenticated;

-- Realtime: ignore if already added
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_recipients;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;
