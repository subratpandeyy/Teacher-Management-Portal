-- Migration: Profiles Recursion Fix & Teacher-Student Assignment Relational Model
-- Date: 2026-06-14

-- 1. Recreate RLS helper functions with SET row_security = off to bypass recursion
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
 SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_role public.user_role)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path = public
 SET row_security = off
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = p_role
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID, p_profile_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
SET row_security = off
STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = p_conversation_id 
      AND profile_id = p_profile_id
  );
END;
$$;

-- 2. Simplify profiles UPDATE policy to avoid subquery checks
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR public.is_admin())
  WITH CHECK (id = auth.uid() OR public.is_admin());

-- 3. Create teacher_student_assignments table
CREATE TABLE IF NOT EXISTS public.teacher_student_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assigned_by_role public.user_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (teacher_id, student_id)
);

ALTER TABLE public.teacher_student_assignments ENABLE ROW LEVEL SECURITY;

-- 4. Create belongs_to_coordinator check function
CREATE OR REPLACE FUNCTION public.belongs_to_coordinator(p_profile_id UUID, p_coordinator_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
SET row_security = off 
STABLE AS $$
BEGIN
  RETURN EXISTS (
    WITH ranked_assignments AS (
      SELECT coordinator_id,
             ROW_NUMBER() OVER (
               PARTITION BY COALESCE(teacher_id, student_id)
               ORDER BY created_at DESC
             ) as rn
      FROM public.coordinator_assignments
      WHERE teacher_id = p_profile_id OR student_id = p_profile_id
    )
    SELECT 1 FROM ranked_assignments
    WHERE rn = 1 AND coordinator_id = p_coordinator_id
  );
END;
$$;

-- 5. Define RLS policies for teacher_student_assignments
DROP POLICY IF EXISTS "Admins have full access on teacher_student_assignments" ON public.teacher_student_assignments;
CREATE POLICY "Admins have full access on teacher_student_assignments"
  ON public.teacher_student_assignments
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Coordinators can manage teacher_student_assignments in scope" ON public.teacher_student_assignments;
CREATE POLICY "Coordinators can manage teacher_student_assignments in scope"
  ON public.teacher_student_assignments
  FOR ALL
  TO authenticated
  USING (
    (public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(teacher_id, auth.uid()) OR
      public.belongs_to_coordinator(student_id, auth.uid())
    ))
  )
  WITH CHECK (
    (public.has_role('coordinator'::public.user_role) AND (
      public.belongs_to_coordinator(teacher_id, auth.uid()) OR
      public.belongs_to_coordinator(student_id, auth.uid())
    ))
  );

DROP POLICY IF EXISTS "Students can read their own teacher assignments" ON public.teacher_student_assignments;
CREATE POLICY "Students can read their own teacher assignments"
  ON public.teacher_student_assignments
  FOR SELECT
  TO authenticated
  USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Teachers can read their assigned student assignments" ON public.teacher_student_assignments;
CREATE POLICY "Teachers can read their assigned student assignments"
  ON public.teacher_student_assignments
  FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid());

-- 6. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_update_teacher_student_assignments_updated_at ON public.teacher_student_assignments;
CREATE TRIGGER trigger_update_teacher_student_assignments_updated_at
  BEFORE UPDATE ON public.teacher_student_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
