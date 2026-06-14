-- Migration: Fix Groups and Group Members RLS Infinite Recursion
-- Date: 2026-06-14

-- ─── 1. Create SECURITY DEFINER Helpers ──────────────────────────────────────────

-- Helper to check group visibility
CREATE OR REPLACE FUNCTION public.can_view_group(p_group_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_role public.user_role;
  v_type TEXT;
  v_created_by UUID;
BEGIN
  -- Admin bypass
  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  -- Get group metadata (bypassing RLS)
  SELECT type, created_by INTO v_type, v_created_by FROM public.groups WHERE id = p_group_id;
  IF v_created_by IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Creator or Public group bypass
  IF v_type = 'public' OR v_created_by = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- Member check
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = p_group_id AND teacher_id = p_user_id
  );
END;
$$;

-- Helper to check member insertion
CREATE OR REPLACE FUNCTION public.can_add_group_member(p_group_id UUID, p_member_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_creator_id UUID;
  v_creator_role public.user_role;
  v_group_type TEXT;
  v_user_role public.user_role;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;

  -- Admin bypass
  IF v_user_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  -- Get group metadata
  SELECT created_by, creator_role, type INTO v_creator_id, v_creator_role, v_group_type
  FROM public.groups
  WHERE id = p_group_id;

  IF v_creator_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Self-joining a public group
  IF p_member_id = p_user_id AND v_group_type = 'public' THEN
    RETURN TRUE;
  END IF;

  -- Creator-based addition rules
  IF v_creator_id = p_user_id THEN
    IF v_creator_role = 'admin'::public.user_role THEN
      RETURN TRUE;
    END IF;

    -- Coordinator: can add assigned teachers or students in scope
    IF v_creator_role = 'coordinator'::public.user_role THEN
      RETURN public.belongs_to_coordinator(p_member_id, p_user_id);
    END IF;

    -- Teacher: can add assigned students
    IF v_creator_role = 'teacher'::public.user_role THEN
      RETURN EXISTS (
        SELECT 1 FROM public.teacher_student_assignments tsa
        WHERE tsa.teacher_id = p_user_id AND tsa.student_id = p_member_id
      );
    END IF;

    -- Student: can invite other students
    IF v_creator_role = 'student'::public.user_role THEN
      RETURN EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = p_member_id AND p.role = 'student'::public.user_role
      );
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- Helper to check member removal
CREATE OR REPLACE FUNCTION public.can_remove_group_member(p_group_id UUID, p_member_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_creator_id UUID;
  v_user_role public.user_role;
BEGIN
  SELECT role INTO v_user_role FROM public.profiles WHERE id = p_user_id;
  IF v_user_role = 'admin'::public.user_role THEN
    RETURN TRUE;
  END IF;

  -- Self-leaving group
  IF p_member_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  -- Creator management
  SELECT created_by INTO v_creator_id FROM public.groups WHERE id = p_group_id;
  IF v_creator_id = p_user_id THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


-- ─── 2. Apply Refactored Policies ───────────────────────────────────────────

-- Drop old groups policies
DROP POLICY IF EXISTS "groups_select_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_teacher_select_member" ON public.groups;
DROP POLICY IF EXISTS "groups_admin_all" ON public.groups;
DROP POLICY IF EXISTS "Admins have full access on groups" ON public.groups;
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_update_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_delete_policy" ON public.groups;

-- Create clean groups policies
CREATE POLICY "groups_select_policy" ON public.groups
  FOR SELECT TO authenticated USING (public.can_view_group(id, auth.uid()));

CREATE POLICY "groups_insert_policy" ON public.groups
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "groups_update_policy" ON public.groups
  FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.is_admin()) WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "groups_delete_policy" ON public.groups
  FOR DELETE TO authenticated USING (created_by = auth.uid() OR public.is_admin());


-- Drop old group_members policies
DROP POLICY IF EXISTS "group_members_select_policy" ON public.group_members;
DROP POLICY IF EXISTS "group_members_teacher_select_own" ON public.group_members;
DROP POLICY IF EXISTS "group_members_admin_all" ON public.group_members;
DROP POLICY IF EXISTS "Admins have full access on group_members" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_policy" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_policy" ON public.group_members;

-- Create clean group_members policies
CREATE POLICY "group_members_select_policy" ON public.group_members
  FOR SELECT TO authenticated USING (public.can_view_group(group_id, auth.uid()));

CREATE POLICY "group_members_insert_policy" ON public.group_members
  FOR INSERT TO authenticated WITH CHECK (public.can_add_group_member(group_id, teacher_id, auth.uid()));

CREATE POLICY "group_members_delete_policy" ON public.group_members
  FOR DELETE TO authenticated USING (public.can_remove_group_member(group_id, teacher_id, auth.uid()));
