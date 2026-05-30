-- Storage bucket for teacher documents (private, path: {teacher_id}/{document_id}/{filename})

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'teacher-documents',
  'teacher-documents',
  FALSE,
  52428800,
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.storage_teacher_id_from_path(object_name TEXT)
RETURNS UUID
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 1), '')::UUID;
$$;

CREATE POLICY storage_teacher_documents_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR public.storage_teacher_id_from_path(name) = auth.uid()
    )
  );

CREATE POLICY storage_teacher_documents_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND public.storage_teacher_id_from_path(name) = auth.uid()
  );

CREATE POLICY storage_teacher_documents_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR public.storage_teacher_id_from_path(name) = auth.uid()
    )
  );

CREATE POLICY storage_teacher_documents_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR public.storage_teacher_id_from_path(name) = auth.uid()
    )
  );
