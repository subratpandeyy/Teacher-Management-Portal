-- Fix dual-conversation root cause between ensure_direct_conversation and
-- ensure_teacher_conversation.
--
-- Root cause: ensure_teacher_conversation looked up conversations by
-- conversations.teacher_id, while ensure_direct_conversation (and all
-- admin-web clients) looked up by conversation_participants. When an admin
-- or coordinator initiated a chat first via ensure_direct_conversation,
-- the new conversation's teacher_id was set to p_user_a (the caller), not
-- the teacher. When the teacher later opened mobile chat,
-- ensure_teacher_conversation searched WHERE teacher_id = teacherId →
-- NOT FOUND → created a second conversation. Both parties then saw
-- different conversations, appearing as if messages were lost.
--
-- Fix: both ensure_teacher_conversation and handle_new_user now search for
-- existing direct conversations by participant membership, matching the
-- same strategy used by ensure_direct_conversation.

-- ─── 1. Fix ensure_teacher_conversation ─────────────────────────────────────
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
  PERFORM set_config('row_security', 'off', true);

  v_caller := auth.uid();

  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'teacher_id required';
  END IF;

  IF v_caller IS DISTINCT FROM p_teacher_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Search by participant membership (not teacher_id column)
  SELECT cp.conversation_id INTO v_id
  FROM public.conversation_participants cp
  JOIN public.conversations c ON c.id = cp.conversation_id
  WHERE cp.profile_id = p_teacher_id
    AND (c.type IS NULL OR c.type = 'direct')
  ORDER BY c.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (teacher_id, type)
    VALUES (p_teacher_id, 'direct')
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_id, p_teacher_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  SELECT p.id INTO v_admin_id FROM public.profiles p WHERE p.role = 'admin' LIMIT 1;
  IF v_admin_id IS NOT NULL AND v_admin_id <> p_teacher_id THEN
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES (v_id, v_admin_id)
    ON CONFLICT (conversation_id, profile_id) DO NOTHING;
  END IF;

  IF v_caller IS NOT NULL AND v_caller <> p_teacher_id THEN
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES (v_id, v_caller)
    ON CONFLICT (conversation_id, profile_id) DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.ensure_teacher_conversation(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_teacher_conversation(UUID) TO authenticated;

-- ─── 2. Fix handle_new_user trigger ─────────────────────────────────────────
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

  v_role_enum := 'teacher'::public.user_role;
  BEGIN
    v_role_enum := v_role_text::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role_enum := 'teacher'::public.user_role;
  END;

  INSERT INTO public.profiles (id, role, display_name)
  VALUES (NEW.id, v_role_enum, v_display_name)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

  BEGIN
    IF v_role_text <> 'admin' THEN
      -- Search by participant membership (not teacher_id column)
      SELECT cp.conversation_id INTO v_conv_id
      FROM public.conversation_participants cp
      JOIN public.conversations c ON c.id = cp.conversation_id
      WHERE cp.profile_id = NEW.id
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
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
