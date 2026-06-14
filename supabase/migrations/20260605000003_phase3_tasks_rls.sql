-- Phase 3: Task Management RLS Policies

-- Users can view tasks assigned to them
CREATE POLICY "Users can view their assigned tasks"
  ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    assigned_to = auth.uid() OR 
    assigned_by = auth.uid() OR
    public.is_admin()
  );

-- Users can update status of tasks assigned to them
CREATE POLICY "Users can update their assigned tasks status"
  ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- Admins and Coordinators can create tasks
CREATE POLICY "Admins and Coordinators can create tasks"
  ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin() OR 
    public.has_role('coordinator')
  );

-- Creators and Admins can update/delete tasks
CREATE POLICY "Creators and Admins can manage tasks"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (
    assigned_by = auth.uid() OR 
    public.is_admin()
  )
  WITH CHECK (
    assigned_by = auth.uid() OR 
    public.is_admin()
  );
