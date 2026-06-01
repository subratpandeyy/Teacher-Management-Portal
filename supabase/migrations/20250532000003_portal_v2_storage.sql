-- Chat attachments in teacher-documents bucket under chat/{conversation_id}/

DROP POLICY IF EXISTS storage_chat_attachments_insert ON storage.objects;
CREATE POLICY storage_chat_attachments_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'chat'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::TEXT = (storage.foldername(name))[2]
          AND c.teacher_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS storage_chat_attachments_select ON storage.objects;
CREATE POLICY storage_chat_attachments_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'chat'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id::TEXT = (storage.foldername(name))[2]
          AND c.teacher_id = auth.uid()
      )
    )
  );

-- Broadcast attachments (admin upload, teachers read via signed URL + path in row)
DROP POLICY IF EXISTS storage_broadcast_attachments_admin_insert ON storage.objects;
CREATE POLICY storage_broadcast_attachments_admin_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'broadcasts'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS storage_broadcast_attachments_select ON storage.objects;
CREATE POLICY storage_broadcast_attachments_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'teacher-documents'
    AND (storage.foldername(name))[1] = 'broadcasts'
    AND (
      public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.broadcast_recipients br
        JOIN public.broadcasts b ON b.id = br.broadcast_id
        WHERE br.teacher_id = auth.uid()
          AND b.attachment_url = name
      )
    )
  );
