-- Teachers can no longer upload documents (admin-only distribution)
DROP POLICY IF EXISTS documents_insert ON public.documents;

CREATE POLICY documents_insert ON public.documents
  FOR INSERT
  WITH CHECK (public.is_admin());

-- Teachers cannot update/delete shared documents (legacy own rows still deletable via existing policies)
CREATE POLICY documents_teacher_no_update_shared ON public.documents
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    public.is_admin()
    OR (teacher_id = auth.uid() AND teacher_id IS NOT NULL)
  );

CREATE POLICY documents_teacher_no_delete_shared ON public.documents
  AS RESTRICTIVE
  FOR DELETE
  USING (
    public.is_admin()
    OR (teacher_id = auth.uid() AND teacher_id IS NOT NULL)
  );
