-- Migration: Stabilization RBAC, RLS Recursion Fixes, and Admin policies
-- Date: 2026-06-14

-- 1. Add columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Define the SECURITY DEFINER function to bypass RLS for participant check
CREATE OR REPLACE FUNCTION public.is_conversation_participant(p_conversation_id UUID, p_profile_id UUID)
RETURNS BOOLEAN 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public 
STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.conversation_participants 
    WHERE conversation_id = p_conversation_id 
      AND profile_id = p_profile_id
  );
END;
$$;

ALTER FUNCTION public.is_conversation_participant(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(UUID, UUID) TO authenticated;

-- 3. Fix conversation_participants SELECT policy
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR public.is_conversation_participant(conversation_id, auth.uid())
    OR public.is_admin()
  );

-- 4. Fix conversations SELECT policy
DROP POLICY IF EXISTS conversations_select ON public.conversations;
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    teacher_id = auth.uid()
    OR public.is_conversation_participant(id, auth.uid())
    OR public.is_admin()
  );

-- 5. Fix chat_messages SELECT & INSERT policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id, auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_conversation_participant(conversation_id, auth.uid())
    OR public.is_admin()
  );

-- 6. Update handle_new_user trigger function
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
  v_phone_text TEXT;
  v_status_text TEXT;
  v_conv_id UUID;
  v_admin_id UUID;
BEGIN
  -- Bypass RLS for all trigger writes (auth.uid() is NULL during signup)
  PERFORM set_config('row_security', 'off', true);

  v_role_text := lower(trim(COALESCE(NEW.raw_user_meta_data->>'role', 'teacher')));
  IF v_role_text NOT IN ('admin', 'coordinator', 'teacher', 'student') THEN
    v_role_text := 'teacher';
  END IF;

  v_display_name := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'display_name'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  v_phone_text := NEW.raw_user_meta_data->>'phone';
  v_status_text := COALESCE(NEW.raw_user_meta_data->>'status', 'active');

  v_role_enum := 'teacher'::public.user_role;
  BEGIN
    v_role_enum := v_role_text::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role_enum := 'teacher'::public.user_role;
  END;

  -- Critical path: profile must exist or signup must fail loudly
  INSERT INTO public.profiles (id, role, display_name, phone, status)
  VALUES (NEW.id, v_role_enum, v_display_name, v_phone_text, v_status_text)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    status = COALESCE(public.profiles.status, EXCLUDED.status);

  -- Non-critical: direct support chat
  BEGIN
    IF v_role_text <> 'admin' THEN
      SELECT c.id INTO v_conv_id
      FROM public.conversations c
      WHERE c.teacher_id = NEW.id
        AND (c.type IS NULL OR c.type = 'direct')
      ORDER BY c.created_at DESC
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO public.conversations (teacher_id, type)
        VALUES (NEW.id, 'direct')
        RETURNING id INTO v_conv_id;
      END IF;

      INSERT INTO public.conversation_participants (conversation_id, profile_id)
      VALUES (v_conv_id, NEW.id)
      ON CONFLICT (conversation_id, profile_id) DO NOTHING;

      SELECT p.id INTO v_admin_id
      FROM public.profiles p
      WHERE p.role = 'admin'
      ORDER BY p.created_at ASC
      LIMIT 1;

      IF v_admin_id IS NOT NULL AND v_admin_id <> NEW.id THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id)
        VALUES (v_conv_id, v_admin_id)
        ON CONFLICT (conversation_id, profile_id) DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: chat init skipped for %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'handle_new_user failed for %: %', NEW.id, SQLERRM;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- 7. Ensure Admins have full access to all tables
-- Profiles
DROP POLICY IF EXISTS "Admins have full access on profiles" ON public.profiles;
CREATE POLICY "Admins have full access on profiles" ON public.profiles FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Conversations
DROP POLICY IF EXISTS "Admins have full access on conversations" ON public.conversations;
CREATE POLICY "Admins have full access on conversations" ON public.conversations FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Chat messages
DROP POLICY IF EXISTS "Admins have full access on chat_messages" ON public.chat_messages;
CREATE POLICY "Admins have full access on chat_messages" ON public.chat_messages FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Tasks
DROP POLICY IF EXISTS "Admins have full access on tasks" ON public.tasks;
CREATE POLICY "Admins have full access on tasks" ON public.tasks FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Attendance
DROP POLICY IF EXISTS "Admins have full access on attendance" ON public.attendance;
CREATE POLICY "Admins have full access on attendance" ON public.attendance FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Student progress
DROP POLICY IF EXISTS "Admins have full access on student_progress" ON public.student_progress;
CREATE POLICY "Admins have full access on student_progress" ON public.student_progress FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Daily reports
DROP POLICY IF EXISTS "Admins have full access on daily_reports" ON public.daily_reports;
CREATE POLICY "Admins have full access on daily_reports" ON public.daily_reports FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Teacher availability
DROP POLICY IF EXISTS "Admins have full access on teacher_availability" ON public.teacher_availability;
CREATE POLICY "Admins have full access on teacher_availability" ON public.teacher_availability FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Broadcasts
DROP POLICY IF EXISTS "Admins have full access on broadcasts" ON public.broadcasts;
CREATE POLICY "Admins have full access on broadcasts" ON public.broadcasts FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Broadcast feedback
DROP POLICY IF EXISTS "Admins have full access on broadcast_feedback" ON public.broadcast_feedback;
CREATE POLICY "Admins have full access on broadcast_feedback" ON public.broadcast_feedback FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Groups
DROP POLICY IF EXISTS "Admins have full access on groups" ON public.groups;
CREATE POLICY "Admins have full access on groups" ON public.groups FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Group members
DROP POLICY IF EXISTS "Admins have full access on group_members" ON public.group_members;
CREATE POLICY "Admins have full access on group_members" ON public.group_members FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Documents
DROP POLICY IF EXISTS "Admins have full access on documents" ON public.documents;
CREATE POLICY "Admins have full access on documents" ON public.documents FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Notifications
DROP POLICY IF EXISTS "Admins have full access on notifications" ON public.notifications;
CREATE POLICY "Admins have full access on notifications" ON public.notifications FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


-- 8. Define Admin User Deletion RPC
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Forbidden'; END IF;
  DELETE FROM auth.users WHERE id = p_user_id;
END; $$;
