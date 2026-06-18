-- Stabilization: enable RLS, attendance uniqueness, signup trigger with participants,
-- conversation_participants RLS, daily_reports RLS, ensure_teacher_conversation fix
--
-- NOTE: Signup trigger RLS bypass is fixed in 20260608000002_signup_root_cause_fix.sql
-- (this file enabled RLS on conversation_participants before the trigger could bypass it).

-- ─── 1. Enable RLS on tables that have policies but RLS was never turned on ───
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordinator_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;

-- ─── 2. Attendance: one record per student per day ───────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_student_date
  ON public.attendance (student_id, date);

-- ─── 3. Daily reports RLS ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Coordinators can manage their daily reports" ON public.daily_reports;
CREATE POLICY "Coordinators can manage their daily reports"
  ON public.daily_reports
  FOR ALL
  TO authenticated
  USING (coordinator_id = auth.uid() OR public.is_admin())
  WITH CHECK (coordinator_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins can view all daily reports" ON public.daily_reports;
CREATE POLICY "Admins can view all daily reports"
  ON public.daily_reports
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ─── 4. Conversation participants RLS ───────────────────────────────────────
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversation_participants.conversation_id
        AND cp.profile_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can manage conversation participants" ON public.conversation_participants;
CREATE POLICY "Admins can manage conversation participants"
  ON public.conversation_participants
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users can join conversations they own" ON public.conversation_participants;
CREATE POLICY "Users can join conversations they own"
  ON public.conversation_participants
  FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    OR public.is_admin()
  );

-- ─── 5. Bulletproof signup trigger (profile + chat participants) ─────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_text TEXT;
  v_role_enum public.user_role;
  v_display_name TEXT;
  v_conv_id UUID;
  v_admin_id UUID;
BEGIN
  v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    split_part(NEW.email, '@', 1),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  v_role_enum := 'teacher'::public.user_role;
  BEGIN
    IF v_role_text = 'admin' THEN v_role_enum := 'admin'::public.user_role;
    ELSIF v_role_text = 'coordinator' THEN v_role_enum := 'coordinator'::public.user_role;
    ELSIF v_role_text = 'student' THEN v_role_enum := 'student'::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_role_enum := 'teacher'::public.user_role;
  END;

  BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (NEW.id, v_role_enum, v_display_name)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.profiles (id, role, display_name)
      VALUES (NEW.id, 'teacher'::public.user_role, v_display_name)
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    END;
  END;

  BEGIN
    IF v_role_text != 'admin' THEN
      SELECT id INTO v_conv_id FROM public.conversations
      WHERE teacher_id = NEW.id AND (type IS NULL OR type = 'direct')
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO public.conversations (teacher_id, type)
        VALUES (NEW.id, 'direct')
        RETURNING id INTO v_conv_id;
      END IF;

      IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id)
        VALUES (v_conv_id, NEW.id)
        ON CONFLICT DO NOTHING;

        SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
        IF v_admin_id IS NOT NULL AND v_admin_id != NEW.id THEN
          INSERT INTO public.conversation_participants (conversation_id, profile_id)
          VALUES (v_conv_id, v_admin_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to initialize chat for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── 6. ensure_teacher_conversation: create conversation + participants ───────
CREATE OR REPLACE FUNCTION public.ensure_teacher_conversation(p_teacher_id UUID DEFAULT auth.uid())
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_admin_id UUID;
  v_caller UUID;
BEGIN
  v_caller := auth.uid();

  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'teacher_id required';
  END IF;

  IF v_caller IS DISTINCT FROM p_teacher_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT id INTO v_id FROM public.conversations
  WHERE teacher_id = p_teacher_id AND (type IS NULL OR type = 'direct')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (teacher_id, type)
    VALUES (p_teacher_id, 'direct')
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_id, p_teacher_id)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id != p_teacher_id THEN
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES (v_id, v_admin_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_caller IS NOT NULL AND v_caller != p_teacher_id THEN
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES (v_id, v_caller)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_teacher_conversation(UUID) TO authenticated;
