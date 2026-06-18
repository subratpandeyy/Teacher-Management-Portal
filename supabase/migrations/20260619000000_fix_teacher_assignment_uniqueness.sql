-- Fix Teacher ↔ Coordinator Assignment: uniqueness, soft-delete, cleanup
-- Root cause: coordinator_assignments had no constraint preventing a teacher
-- from being assigned to multiple coordinators simultaneously.

-- 1. Add deleted_at column for soft-delete support
ALTER TABLE public.coordinator_assignments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Partial unique indexes: enforce at most ONE active (non-deleted) assignment
-- per teacher and per student. Historical assignments are preserved via soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_teacher_assignment
  ON public.coordinator_assignments (teacher_id)
  WHERE teacher_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_student_assignment
  ON public.coordinator_assignments (student_id)
  WHERE student_id IS NOT NULL AND deleted_at IS NULL;

-- 3. Update belongs_to_coordinator to respect soft-deletes
CREATE OR REPLACE FUNCTION public.belongs_to_coordinator(p_profile_id UUID, p_coordinator_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.coordinator_assignments
    WHERE (teacher_id = p_profile_id OR student_id = p_profile_id)
      AND coordinator_id = p_coordinator_id
      AND deleted_at IS NULL
  );
END;
$$;

-- 4. Cleanup: soft-delete duplicate teacher assignments, keeping only the most recent
DO $$
DECLARE
  dup_record RECORD;
  cleanup_count INT := 0;
BEGIN
  FOR dup_record IN (
    SELECT teacher_id, MAX(created_at) AS latest_created
    FROM public.coordinator_assignments
    WHERE teacher_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY teacher_id
    HAVING COUNT(*) > 1
  ) LOOP
    UPDATE public.coordinator_assignments
    SET deleted_at = NOW()
    WHERE teacher_id = dup_record.teacher_id
      AND deleted_at IS NULL
      AND created_at < dup_record.latest_created;
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % duplicate teacher assignments for teacher_id: %', cleanup_count, dup_record.teacher_id;
  END LOOP;

  FOR dup_record IN (
    SELECT student_id, MAX(created_at) AS latest_created
    FROM public.coordinator_assignments
    WHERE student_id IS NOT NULL AND deleted_at IS NULL
    GROUP BY student_id
    HAVING COUNT(*) > 1
  ) LOOP
    UPDATE public.coordinator_assignments
    SET deleted_at = NOW()
    WHERE student_id = dup_record.student_id
      AND deleted_at IS NULL
      AND created_at < dup_record.latest_created;
    GET DIAGNOSTICS cleanup_count = ROW_COUNT;
    RAISE NOTICE 'Cleaned up % duplicate student assignments for student_id: %', cleanup_count, dup_record.student_id;
  END LOOP;

  RAISE NOTICE 'Cleanup complete. Total records cleaned: %', cleanup_count;
END;
$$;
