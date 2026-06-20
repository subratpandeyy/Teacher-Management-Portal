-- Migration: 20260625000000_create_global_search_rpc
-- Description: Create global_search RPC function + trigram indexes for search

-- 1. Enable pg_trgm extension (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Trigram indexes for ILIKE '%query%' performance
CREATE INDEX IF NOT EXISTS idx_profiles_display_name_trgm
  ON public.profiles USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_email_trgm
  ON public.profiles USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
  ON public.tasks USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_groups_name_trgm
  ON public.groups USING gin (name gin_trgm_ops);

-- 3. Global search RPC function
CREATE OR REPLACE FUNCTION public.global_search(
  p_query TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  result_type TEXT,
  result_id UUID,
  title TEXT,
  subtitle TEXT,
  url_path TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_search TEXT;
BEGIN
  v_search := '%' || p_query || '%';

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RETURN;
  END IF;

  -- ── Users (Profiles) ──────────────────────────────────────────────────────
  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT 'user'::TEXT, p.id, p.display_name, p.email,
        CASE
          WHEN p.role = 'teacher'    THEN '/teachers/' || p.id
          WHEN p.role = 'student'    THEN '/students/' || p.id
          WHEN p.role = 'coordinator' THEN '/coordinators/' || p.id
          ELSE '/users/' || p.id
        END
      FROM public.profiles p
      WHERE p.deleted_at IS NULL
        AND (p.display_name ILIKE v_search OR p.email ILIKE v_search)
      LIMIT 10;
  ELSIF v_role = 'coordinator' THEN
    RETURN QUERY
      SELECT DISTINCT 'user'::TEXT, p.id, p.display_name, p.email,
        CASE WHEN p.role = 'teacher' THEN '/teachers/' || p.id
             ELSE '/students/' || p.id
        END
      FROM public.profiles p
      WHERE p.deleted_at IS NULL
        AND (p.display_name ILIKE v_search OR p.email ILIKE v_search)
        AND p.id IN (
          SELECT ca.teacher_id FROM public.coordinator_assignments ca
            WHERE ca.coordinator_id = p_user_id AND ca.teacher_id IS NOT NULL AND ca.deleted_at IS NULL
          UNION
          SELECT ca.student_id FROM public.coordinator_assignments ca
            WHERE ca.coordinator_id = p_user_id AND ca.student_id IS NOT NULL AND ca.deleted_at IS NULL
        )
      LIMIT 10;
  ELSE
    RETURN QUERY
      SELECT 'user'::TEXT, p.id, p.display_name, p.email, '/profile'
      FROM public.profiles p
      WHERE p.id = p_user_id
        AND (p.display_name ILIKE v_search OR p.email ILIKE v_search)
      LIMIT 5;
  END IF;

  -- ── Tasks ─────────────────────────────────────────────────────────────────
  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT 'task'::TEXT, t.id, t.title, COALESCE(t.description, ''), '/tasks/' || t.id
      FROM public.tasks t
      WHERE t.title ILIKE v_search OR COALESCE(t.description, '') ILIKE v_search
      LIMIT 5;
  ELSIF v_role = 'coordinator' THEN
    RETURN QUERY
      SELECT 'task'::TEXT, t.id, t.title, COALESCE(t.description, ''), '/tasks/' || t.id
      FROM public.tasks t
      WHERE (t.title ILIKE v_search OR COALESCE(t.description, '') ILIKE v_search)
        AND (
          t.assigned_by = p_user_id
          OR t.assigned_to IN (
            SELECT ca.teacher_id FROM public.coordinator_assignments ca
              WHERE ca.coordinator_id = p_user_id AND ca.teacher_id IS NOT NULL AND ca.deleted_at IS NULL
            UNION
            SELECT ca.student_id FROM public.coordinator_assignments ca
              WHERE ca.coordinator_id = p_user_id AND ca.student_id IS NOT NULL AND ca.deleted_at IS NULL
          )
        )
      LIMIT 5;
  ELSE
    RETURN QUERY
      SELECT 'task'::TEXT, t.id, t.title, COALESCE(t.description, ''), '/tasks/' || t.id
      FROM public.tasks t
      WHERE (t.title ILIKE v_search OR COALESCE(t.description, '') ILIKE v_search)
        AND t.assigned_to = p_user_id
      LIMIT 5;
  END IF;

  -- ── Groups ────────────────────────────────────────────────────────────────
  IF v_role = 'admin' THEN
    RETURN QUERY
      SELECT 'group'::TEXT, g.id, g.name, COALESCE(g.description, ''), '/groups/' || g.id
      FROM public.groups g
      WHERE g.name ILIKE v_search OR COALESCE(g.description, '') ILIKE v_search
      LIMIT 5;
  ELSE
    RETURN QUERY
      SELECT DISTINCT 'group'::TEXT, g.id, g.name, COALESCE(g.description, ''), '/groups/' || g.id
      FROM public.groups g
      WHERE (g.name ILIKE v_search OR COALESCE(g.description, '') ILIKE v_search)
        AND (
          g.type = 'public'
          OR g.created_by = p_user_id
          OR g.id IN (
            SELECT gm.group_id FROM public.group_members gm WHERE gm.teacher_id = p_user_id
          )
        )
      LIMIT 5;
  END IF;
END;
$$;
