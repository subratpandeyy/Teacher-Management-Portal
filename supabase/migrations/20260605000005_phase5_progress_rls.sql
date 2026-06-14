-- Phase 5: Student Progress RLS Policies

-- Teachers can manage progress for their students
CREATE POLICY "Teachers can manage progress"
  ON public.student_progress
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

-- Students can view their own progress
CREATE POLICY "Students can view their own progress"
  ON public.student_progress
  FOR SELECT
  TO authenticated
  USING (
    student_id = auth.uid() OR 
    teacher_id = auth.uid() OR
    public.is_admin() OR
    public.has_role('coordinator')
  );
