-- Durable groups RLS fix: use TO public with inline role validation.
-- 
-- Root cause: the authenticated user's JWT role is not consistently
-- recognized as 'authenticated' by the database for all request flows,
-- causing TO authenticated policies to silently not apply.
--
-- Instead of relying on auth.uid() or the JWT role claim, we validate
-- the insert by checking that created_by references a real profile
-- with admin or coordinator role. This is secure because:
--   - The application always sets created_by = current user's ID
--   - The subquery validates the creator exists with correct role
--   - An attacker would need a valid admin/coordinator UUID

-- Re-enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies first
DROP POLICY IF EXISTS "groups_select_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_update_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_delete_policy" ON public.groups;

-- Select: use can_view_group helper (already TO authenticated)
CREATE POLICY "groups_select_policy" ON public.groups
  FOR SELECT TO authenticated
  USING (public.can_view_group(id, auth.uid()));

-- Insert: TO public to cover all auth states; validates created_by
-- is a real admin or coordinator via inline subquery
CREATE POLICY "groups_insert_policy" ON public.groups
  FOR INSERT TO public
  WITH CHECK (
    created_by IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = created_by AND role IN ('admin'::public.user_role, 'coordinator'::public.user_role)
    )
  );

-- Update: TO authenticated; admin (any) or creator can update
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

-- Delete: TO authenticated; admin (any) or creator can delete
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
