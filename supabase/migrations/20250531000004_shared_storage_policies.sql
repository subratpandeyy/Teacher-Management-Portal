-- Allow admin uploads to shared/ storage path (single file, many recipients)
CREATE POLICY storage_shared_documents_admin_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'shared'
    AND public.is_admin()
  );

CREATE POLICY storage_shared_documents_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] = 'shared'
        AND EXISTS (
          SELECT 1 FROM public.documents d
          JOIN public.document_recipients dr ON dr.document_id = d.id
          WHERE d.storage_path = name AND dr.teacher_id = auth.uid()
        )
      )
      OR public.storage_teacher_id_from_path(name) = auth.uid()
    )
  );
