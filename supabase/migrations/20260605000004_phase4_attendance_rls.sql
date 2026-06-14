-- Phase 4: Attendance RLS Policies

-- Teachers can mark attendance for their students
CREATE POLICY "Teachers can manage attendance"
  ON public.attendance
  FOR ALL
  TO authenticated
  USING (
    teacher_id = auth.uid() OR 
    public.is_admin() OR
    public.has_role('coordinator')
  )
  WITH CHECK (
    teacher_id = auth.uid() OR 
    public.is_admin() OR
    public.has_role('coordinator')
  );

-- Students can view their own attendance
CREATE POLICY "Students can view their own attendance"
  ON public.attendance
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid() OR 
    teacher_id = auth.uid() OR
    public.is_admin() OR
    public.has_role('coordinator')
  );
