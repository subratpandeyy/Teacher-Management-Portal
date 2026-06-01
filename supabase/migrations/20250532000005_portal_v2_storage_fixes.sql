-- Storage: attachments under attachments/broadcasts/{broadcast_id}/ (TEXT paths only)

DROP POLICY IF EXISTS storage_broadcast_attachments_admin_insert ON storage.objects;
DROP POLICY IF EXISTS storage_broadcast_attachments_select ON storage.objects;

CREATE POLICY storage_broadcast_attachments_admin_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'attachments'
    AND (storage.foldername(name))[2] = 'broadcasts'
    AND public.is_admin()
  );

CREATE POLICY storage_broadcast_attachments_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'attachments'
    AND (storage.foldername(name))[2] = 'broadcasts'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.broadcast_attachments ba
        JOIN public.broadcast_recipients br ON br.broadcast_id = ba.broadcast_id
        WHERE ba.storage_path = name
          AND br.teacher_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.broadcast_recipients br
        JOIN public.broadcasts b ON b.id = br.broadcast_id
        WHERE br.teacher_id = auth.uid()
          AND b.attachment_url = name
      )
    )
  );
