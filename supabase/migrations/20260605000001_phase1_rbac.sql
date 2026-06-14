-- Phase 1: RBAC Foundation and Coordinator Schema

-- 1. Update user_role enum (cannot be done inside a transaction easily in some versions, but Supabase supports it)
DO $$ BEGIN
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'coordinator';
  ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'student';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Coordinator Assignments
CREATE TABLE IF NOT EXISTS public.coordinator_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT one_target_check CHECK (
    (teacher_id IS NOT NULL AND student_id IS NULL) OR
    (teacher_id IS NULL AND student_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_coord_assign_coordinator ON public.coordinator_assignments(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_coord_assign_teacher ON public.coordinator_assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_coord_assign_student ON public.coordinator_assignments(student_id);

-- 3. Task Management
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('pending', 'in_progress', 'completed', 'overdue');
  CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.task_status NOT NULL DEFAULT 'pending',
  priority public.task_priority NOT NULL DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON public.tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);

-- 4. Daily Reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordinator_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_tasks INTEGER DEFAULT 0,
  target TEXT,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(coordinator_id, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_coordinator ON public.daily_reports(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON public.daily_reports(date);

-- 5. Attendance
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM ('present', 'absent', 'late', 'excused');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups (id) ON DELETE SET NULL,
  status public.attendance_status NOT NULL DEFAULT 'present',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_student ON public.attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_teacher ON public.attendance(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_group ON public.attendance(group_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.attendance(date);

-- 6. Student Progress
CREATE TABLE IF NOT EXISTS public.student_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  completion_percentage INTEGER CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
  remarks TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_progress_student ON public.student_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_student_progress_teacher ON public.student_progress(teacher_id);

-- 7. RLS Helper for RBAC
CREATE OR REPLACE FUNCTION public.has_role(p_role public.user_role)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = p_role
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 8. Updated handle_new_user to allow coordinator and student
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
BEGIN
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');
  
  -- Prevent self-promotion to admin unless specifically handled
  IF requested_role = 'admin' THEN
    -- In a real production system, you'd check a secret or only allow admin creation via specific APIs
    -- For now, we follow the existing pattern but allow other roles
    requested_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    requested_role::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  -- Only create conversation for teachers for the existing chat system
  IF requested_role = 'teacher' THEN
    INSERT INTO public.conversations (teacher_id)
    VALUES (NEW.id)
    ON CONFLICT (teacher_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
