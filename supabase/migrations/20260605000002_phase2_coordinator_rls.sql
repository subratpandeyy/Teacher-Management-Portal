-- Phase 2: Coordinator RLS Policies

-- Allow coordinators to view their own assignments
CREATE POLICY "Coordinators can view their assignments"
  ON public.coordinator_assignments
  FOR SELECT
  TO authenticated
  USING (
    coordinator_id = auth.uid() OR 
    public.is_admin()
  );

-- Allow admins full access to assignments
CREATE POLICY "Admins have full access to assignments"
  ON public.coordinator_assignments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Allow coordinators to view profiles of their assigned teachers and students
CREATE POLICY "Coordinators can view assigned profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT teacher_id FROM public.coordinator_assignments WHERE coordinator_id = auth.uid()
      UNION
      SELECT student_id FROM public.coordinator_assignments WHERE coordinator_id = auth.uid()
    ) OR
    id = auth.uid() OR
    public.is_admin()
  );
