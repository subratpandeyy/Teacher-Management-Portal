-- RLS for new tables (additive — existing table policies unchanged unless noted)

ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_unavailability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inactivity_reminders ENABLE ROW LEVEL SECURITY;

-- message_templates
CREATE POLICY message_templates_admin_all ON public.message_templates
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- broadcasts
CREATE POLICY broadcasts_admin_all ON public.broadcasts
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY broadcasts_teacher_select ON public.broadcasts
  FOR SELECT USING (
    published_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.broadcast_recipients br
      WHERE br.broadcast_id = id AND br.teacher_id = auth.uid()
    )
  );

-- broadcast_recipients
CREATE POLICY broadcast_recipients_admin_all ON public.broadcast_recipients
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY broadcast_recipients_teacher_select ON public.broadcast_recipients
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY broadcast_recipients_teacher_update_read ON public.broadcast_recipients
  FOR UPDATE USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- document_recipients
CREATE POLICY document_recipients_admin_all ON public.document_recipients
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY document_recipients_teacher_select ON public.document_recipients
  FOR SELECT USING (teacher_id = auth.uid());

-- document_downloads
CREATE POLICY document_downloads_admin_select ON public.document_downloads
  FOR SELECT USING (public.is_admin());

CREATE POLICY document_downloads_teacher_insert ON public.document_downloads
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

CREATE POLICY document_downloads_teacher_select ON public.document_downloads
  FOR SELECT USING (teacher_id = auth.uid());

-- ADDITIVE: teachers see documents assigned via document_recipients
CREATE POLICY documents_select_via_recipients ON public.documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.document_recipients dr
      WHERE dr.document_id = id AND dr.teacher_id = auth.uid()
    )
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- ADDITIVE: admin inserts shared documents (uploaded_by set, teacher_id null)
CREATE POLICY documents_admin_insert ON public.documents
  FOR INSERT WITH CHECK (public.is_admin());

-- teacher_subjects
CREATE POLICY teacher_subjects_admin_all ON public.teacher_subjects
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY teacher_subjects_teacher_select ON public.teacher_subjects
  FOR SELECT USING (teacher_id = auth.uid());

-- teacher_payments
CREATE POLICY teacher_payments_admin_all ON public.teacher_payments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY teacher_payments_teacher_select ON public.teacher_payments
  FOR SELECT USING (teacher_id = auth.uid());

-- session_reports
CREATE POLICY session_reports_admin_all ON public.session_reports
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY session_reports_teacher_select ON public.session_reports
  FOR SELECT USING (teacher_id = auth.uid());

CREATE POLICY session_reports_teacher_insert ON public.session_reports
  FOR INSERT WITH CHECK (teacher_id = auth.uid());

-- teacher_unavailability
CREATE POLICY teacher_unavailability_admin_select ON public.teacher_unavailability
  FOR SELECT USING (public.is_admin());

CREATE POLICY teacher_unavailability_teacher_all ON public.teacher_unavailability
  FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

-- audit_logs
CREATE POLICY audit_logs_admin_select ON public.audit_logs
  FOR SELECT USING (public.is_admin());

CREATE POLICY audit_logs_admin_insert ON public.audit_logs
  FOR INSERT WITH CHECK (public.is_admin());

-- inactivity_reminders
CREATE POLICY inactivity_reminders_admin_select ON public.inactivity_reminders
  FOR SELECT USING (public.is_admin());

-- Realtime for broadcasts
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcast_recipients;
