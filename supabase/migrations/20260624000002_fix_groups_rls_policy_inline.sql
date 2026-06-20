-- Fix groups RLS policies to use inline role checks instead of
-- helper functions (public.has_role, public.is_admin) to avoid
-- potential evaluation issues in RLS WITH CHECK context.
-- Policy: only admin and coordinator can create/manage groups.
-- Replaces the previous permissive policy from 20260624000001.

-- Insert: only admin or coordinator
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
CREATE POLICY "groups_insert_policy" ON public.groups
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin'::public.user_role, 'coordinator'::public.user_role)
    )
  );

-- Update: admin (any) or coordinator (only their own groups)
DROP POLICY IF EXISTS "groups_update_policy" ON public.groups;
CREATE POLICY "groups_update_policy" ON public.groups
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'::public.user_role
    )
    OR (
      created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'coordinator'::public.user_role
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'::public.user_role
    )
    OR (
      created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'coordinator'::public.user_role
      )
    )
  );

-- Delete: admin (any) or coordinator (only their own groups)
DROP POLICY IF EXISTS "groups_delete_policy" ON public.groups;
CREATE POLICY "groups_delete_policy" ON public.groups
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'::public.user_role
    )
    OR (
      created_by = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'coordinator'::public.user_role
      )
    )
  );
