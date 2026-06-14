-- Signup root-cause fix
--
-- Root cause: handle_new_user inserts into public.profiles / public.conversations /
-- public.conversation_participants while RLS is enabled on those tables.
-- profiles has RLS enabled (20250530000002) but never had an INSERT policy.
-- conversations has RLS enabled with SELECT-only policies.
-- 20260608000001 enabled RLS on conversation_participants with INSERT policies
-- that require auth.uid() = profile_id — NULL during the auth.users trigger.
--
-- When the trigger function does not bypass RLS (non-superuser owner, or hosted
-- Supabase enforcing RLS on SECURITY DEFINER), profile INSERT raises
-- "permission denied" / policy violation → auth.users insert rolls back →
-- "Database error saving new user".
--
-- Secondary causes fixed here:
--   • phase1 trigger used ON CONFLICT (teacher_id) after unique constraint dropped
--   • coordinator/student enum values missing on some databases
--   • conversations.type column missing on databases without phase6

-- ─── 1. Enum values (idempotent) ─────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'coordinator';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'student';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ─── 2. Conversations schema safety ─────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.conversation_type AS ENUM ('direct', 'group');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS type public.conversation_type DEFAULT 'direct';

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_teacher_id_key;

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, profile_id)
);

-- ─── 3. Ensure trigger function owner can bypass RLS ─────────────────────────
DO $$
BEGIN
  ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- ─── 4. Signup-safe trigger (profile is mandatory; chat is best-effort) ───────
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

  v_role_enum := 'teacher'::public.user_role;
  BEGIN
    v_role_enum := v_role_text::public.user_role;
  EXCEPTION WHEN OTHERS THEN
    v_role_enum := 'teacher'::public.user_role;
  END;

  -- Critical path: profile must exist or signup must fail loudly
  INSERT INTO public.profiles (id, role, display_name)
  VALUES (NEW.id, v_role_enum, v_display_name)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name);

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
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── 5. ensure_teacher_conversation: same RLS bypass ────────────────────────
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

  SELECT c.id INTO v_id
  FROM public.conversations c
  WHERE c.teacher_id = p_teacher_id
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

-- ─── 6. Policy: allow users to insert their own profile row (OAuth edge cases) ─
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());
