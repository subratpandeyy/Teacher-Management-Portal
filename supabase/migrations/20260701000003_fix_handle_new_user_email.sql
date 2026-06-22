-- ─── 1. Fix handle_new_user trigger to include email ────────────────────────
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

  INSERT INTO public.profiles (id, role, display_name, email)
  VALUES (NEW.id, v_role_enum, v_display_name, NEW.email)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    email = EXCLUDED.email;

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

-- ─── 2. Backfill existing profiles with missing emails ──────────────────────
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;
