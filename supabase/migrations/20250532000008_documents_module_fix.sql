-- Documents module: teacher uploads, admin open, storage paths

-- ─── RLS: restore teacher → admin document insert + select ───────────────────
DROP POLICY IF EXISTS documents_insert ON public.documents;
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

DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents
  FOR SELECT
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.document_recipients dr
      WHERE dr.document_id = documents.id AND dr.teacher_id = auth.uid()
    )
    OR (
      teacher_id = auth.uid()
      AND direction = 'teacher_to_admin'
    )
  );

-- ─── Teacher inbound uploads in documents bucket: {teacher_id}/inbound/{doc_id}/file ─
DROP POLICY IF EXISTS storage_documents_teacher_inbound_insert ON storage.objects;
CREATE POLICY storage_documents_teacher_inbound_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'inbound'
    AND public.storage_teacher_id_from_path(name) = auth.uid()
  );

DROP POLICY IF EXISTS storage_documents_teacher_inbound_select ON storage.objects;
CREATE POLICY storage_documents_teacher_inbound_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[2] = 'inbound'
    AND (
      public.is_admin()
      OR public.storage_teacher_id_from_path(name) = auth.uid()
    )
  );

-- Admin read teacher_to_admin rows via documents table (any path in documents bucket)
DROP POLICY IF EXISTS storage_documents_admin_teacher_upload_select ON storage.objects;
CREATE POLICY storage_documents_admin_teacher_upload_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = name
        AND d.direction = 'teacher_to_admin'
    )
  );

-- ─── RPC: teacher uploads visible to admin ────────────────────────────────────
DROP FUNCTION IF EXISTS public.teacher_documents_for_admin(UUID);

CREATE FUNCTION public.teacher_documents_for_admin(p_teacher_id UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  file_name TEXT,
  storage_path TEXT,
  storage_bucket TEXT,
  mime_type TEXT,
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
    COALESCE(d.storage_bucket, 'documents'),
    d.mime_type,
    d.created_at
  FROM public.documents d
  WHERE d.teacher_id = p_teacher_id
    AND d.direction = 'teacher_to_admin'
    AND (public.is_admin() OR d.teacher_id = auth.uid())
  ORDER BY d.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.teacher_documents_for_admin(UUID) TO authenticated;

-- ─── Teacher assigned docs include storage_bucket ─────────────────────────────
DROP FUNCTION IF EXISTS public.teacher_assigned_documents();

CREATE FUNCTION public.teacher_assigned_documents()
RETURNS TABLE (
  id UUID,
  title TEXT,
  file_name TEXT,
  storage_path TEXT,
  storage_bucket TEXT,
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
    COALESCE(d.storage_bucket, 'documents'),
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
