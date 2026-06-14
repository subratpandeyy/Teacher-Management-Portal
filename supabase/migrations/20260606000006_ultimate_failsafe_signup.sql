-- Ultimate Failsafe Signup Repair
-- This migration is designed to succeed even if previous migrations failed or if the schema is inconsistent.

-- 1. Enum Maintenance (Attempted individually)
DO $$ 
BEGIN
  BEGIN
    ALTER TYPE public.user_role ADD VALUE 'coordinator';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

DO $$ 
BEGIN
  BEGIN
    ALTER TYPE public.user_role ADD VALUE 'student';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
  END;
END $$;

-- 2. Bulletproof Trigger Function
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
BEGIN
  -- 1. Extract Metadata safely
  v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name', 
    split_part(NEW.email, '@', 1),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  -- 2. Determine Enum Value Safely
  -- We default to 'teacher' and only try to set the others if they exist in the enum
  v_role_enum := 'teacher'::public.user_role;
  BEGIN
    IF v_role_text = 'admin' THEN v_role_enum := 'admin'::public.user_role;
    ELSIF v_role_text = 'coordinator' THEN v_role_enum := 'coordinator'::public.user_role;
    ELSIF v_role_text = 'student' THEN v_role_enum := 'student'::public.user_role;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to teacher if cast fails (e.g. enum doesn't have the value yet)
    v_role_enum := 'teacher'::public.user_role;
  END;

  -- 3. Insert Profile
  -- We only insert the columns we KNOW exist in the base schema
  BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (NEW.id, v_role_enum, v_display_name)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
  EXCEPTION WHEN OTHERS THEN
    -- Final fallback: Minimal insert
    INSERT INTO public.profiles (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
  END;

  -- 4. Conversations (Using Dynamic SQL to handle missing columns)
  BEGIN
    -- Check if conversations table exists and has teacher_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'conversations' AND column_name = 'teacher_id'
    ) THEN
      -- Use dynamic SQL for the insert to handle potential missing 'type' column
      IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'conversations' AND column_name = 'type'
      ) THEN
        EXECUTE 'INSERT INTO public.conversations (teacher_id, type) VALUES ($1, ''direct'') ON CONFLICT DO NOTHING' USING NEW.id;
      ELSE
        EXECUTE 'INSERT INTO public.conversations (teacher_id) VALUES ($1) ON CONFLICT DO NOTHING' USING NEW.id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Never block signup for conversations
  END;

  RETURN NEW;
END;
$$;

-- 3. Re-attach Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
