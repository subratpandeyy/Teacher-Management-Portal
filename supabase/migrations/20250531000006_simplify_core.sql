-- Simplify EduBridge Connect: drop bloat, keep broadcasts, documents, chat, availability

-- ─── Drop removed features ────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.teacher_engagement_metrics;
DROP FUNCTION IF EXISTS public.log_audit(TEXT, JSONB);
DROP FUNCTION IF EXISTS public.publish_due_inbox_messages();
DROP FUNCTION IF EXISTS public.mark_document_downloaded(UUID);

DROP TABLE IF EXISTS public.inactivity_reminders CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.session_reports CASCADE;
DROP TABLE IF EXISTS public.teacher_payments CASCADE;
DROP TABLE IF EXISTS public.document_downloads CASCADE;
DROP TABLE IF EXISTS public.teacher_subjects CASCADE;
DROP TABLE IF EXISTS public.inbox_messages CASCADE;

ALTER TABLE public.broadcasts DROP COLUMN IF EXISTS template_id;
DROP TABLE IF EXISTS public.message_templates CASCADE;

DROP TYPE IF EXISTS public.payment_status;

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS hourly_rate,
  DROP COLUMN IF EXISTS email_notifications,
  DROP COLUMN IF EXISTS subject;

-- ─── Availability (replaces unavailability) ─────────────────────────────────
DROP TABLE IF EXISTS public.teacher_unavailability CASCADE;

CREATE TYPE public.availability_kind AS ENUM ('date_range', 'recurring_weekly');

CREATE TABLE public.teacher_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind public.availability_kind NOT NULL,
  start_date DATE,
  end_date DATE,
  day_of_week SMALLINT CHECK (day_of_week IS NULL OR (day_of_week >= 0 AND day_of_week <= 6)),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT availability_date_range CHECK (
    kind <> 'date_range' OR (start_date IS NOT NULL AND end_date IS NOT NULL)
  ),
  CONSTRAINT availability_recurring CHECK (
    kind <> 'recurring_weekly' OR day_of_week IS NOT NULL
  )
);

CREATE INDEX teacher_availability_teacher_idx ON public.teacher_availability (teacher_id);

ALTER TABLE public.teacher_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_availability_teacher_all ON public.teacher_availability
  FOR ALL
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY teacher_availability_admin_select ON public.teacher_availability
  FOR SELECT
  USING (public.is_admin());

-- ─── Documents: bidirectional admin ↔ teacher ─────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.document_direction AS ENUM ('admin_to_teacher', 'teacher_to_admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS direction public.document_direction;

UPDATE public.documents
SET direction = 'teacher_to_admin'
WHERE direction IS NULL
  AND teacher_id IS NOT NULL
  AND uploaded_by IS NOT NULL
  AND teacher_id = uploaded_by
  AND NOT EXISTS (
    SELECT 1 FROM public.document_recipients dr WHERE dr.document_id = documents.id
  );

UPDATE public.documents
SET direction = 'admin_to_teacher'
WHERE direction IS NULL;

ALTER TABLE public.documents
  ALTER COLUMN direction SET DEFAULT 'admin_to_teacher';

ALTER TABLE public.documents
  ALTER COLUMN direction SET NOT NULL;

-- Document policies: teachers may upload to admin only
DROP POLICY IF EXISTS documents_insert ON public.documents;
DROP POLICY IF EXISTS documents_teacher_no_update_shared ON public.documents;
DROP POLICY IF EXISTS documents_teacher_no_delete_shared ON public.documents;
DROP POLICY IF EXISTS documents_admin_insert ON public.documents;

CREATE POLICY documents_insert ON public.documents
  FOR INSERT
  WITH CHECK (
    public.is_admin()
    OR (
      teacher_id = auth.uid()
      AND uploaded_by = auth.uid()
      AND direction = 'teacher_to_admin'
    )
  );

CREATE POLICY documents_teacher_delete_own ON public.documents
  FOR DELETE
  USING (
    public.is_admin()
    OR (teacher_id = auth.uid() AND direction = 'teacher_to_admin')
  );

-- Teachers see assigned admin docs + own uploads to admin
DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents
  FOR SELECT
  USING (
    public.is_admin()
    OR (teacher_id = auth.uid() AND direction = 'teacher_to_admin')
    OR (
      teacher_id = auth.uid()
      AND direction = 'admin_to_teacher'
    )
  );

-- ─── RPC: teacher vault (admin→teacher assigned docs) ─────────────────────────
DROP FUNCTION IF EXISTS public.teacher_assigned_documents();

CREATE FUNCTION public.teacher_assigned_documents()
RETURNS TABLE (
  id UUID,
  title TEXT,
  storage_path TEXT,
  mime_type TEXT,
  direction public.document_direction,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.title, d.storage_path, d.mime_type, d.direction,
         dr.assigned_at, d.created_at
  FROM public.document_recipients dr
  JOIN public.documents d ON d.id = dr.document_id
  WHERE dr.teacher_id = auth.uid()
    AND d.direction = 'admin_to_teacher'
  UNION ALL
  SELECT d.id, d.title, d.storage_path, d.mime_type, d.direction,
         d.created_at, d.created_at
  FROM public.documents d
  WHERE d.teacher_id = auth.uid()
    AND d.direction = 'admin_to_teacher'
    AND NOT EXISTS (
      SELECT 1 FROM public.document_recipients dr2
      WHERE dr2.document_id = d.id AND dr2.teacher_id = auth.uid()
    )
  ORDER BY assigned_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_assigned_documents() TO authenticated;

-- ─── RPC: teacher uploads shared with admin ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.teacher_documents_for_admin(p_teacher_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  storage_path TEXT,
  mime_type TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.title, d.storage_path, d.mime_type, d.created_at
  FROM public.documents d
  WHERE d.teacher_id = p_teacher_id
    AND d.direction = 'teacher_to_admin'
    AND (public.is_admin() OR d.teacher_id = auth.uid())
  ORDER BY d.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_documents_for_admin(UUID) TO authenticated;

-- ─── Storage: teacher uploads to admin path ───────────────────────────────────
CREATE POLICY storage_teacher_to_admin_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[2] = 'to_admin'
    AND public.storage_teacher_id_from_path(name) = auth.uid()
  );

CREATE POLICY storage_teacher_to_admin_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[2] = 'to_admin'
    AND (
      public.is_admin()
      OR public.storage_teacher_id_from_path(name) = auth.uid()
    )
  );
