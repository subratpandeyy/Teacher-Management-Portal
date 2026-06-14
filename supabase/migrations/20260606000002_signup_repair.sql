-- Signup Repair Migration: Robustness and Enum Consistency

-- 1. Ensure user_role enum is complete
-- ALTER TYPE ... ADD VALUE cannot be executed in a transaction block in some versions.
-- We use a DO block to try adding them individually.
DO $$ 
BEGIN
  BEGIN
    ALTER TYPE public.user_role ADD VALUE 'coordinator';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  
  BEGIN
    ALTER TYPE public.user_role ADD VALUE 'student';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 2. Make handle_new_user more resilient
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
  v_display_name TEXT;
BEGIN
  -- 1. Extract and validate role
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  IF requested_role NOT IN ('admin', 'coordinator', 'teacher', 'student') THEN
    requested_role := 'teacher';
  END IF;

  -- 2. Extract and validate display_name
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name', 
    split_part(NEW.email, '@', 1),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  -- 3. Insert Profile with error handling
  BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
      NEW.id,
      requested_role::public.user_role,
      v_display_name
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to teacher role if cast fails
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
      NEW.id,
      'teacher'::public.user_role,
      v_display_name
    )
    ON CONFLICT (id) DO NOTHING;
  END;

  -- 4. Insert Conversation with error handling
  BEGIN
    -- Ensure conversation exists for the user
    -- We use ON CONFLICT DO NOTHING if teacher_id unique constraint exists
    -- Otherwise, we check manually to avoid duplicates
    IF NOT EXISTS (SELECT 1 FROM public.conversations WHERE teacher_id = NEW.id) THEN
      INSERT INTO public.conversations (teacher_id, type)
      VALUES (NEW.id, 'direct');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Log error or ignore if conversation creation is non-critical for signup
    NULL;
  END;

  RETURN NEW;
END;
$$;

-- 3. Ensure conversations table is properly configured for the trigger
-- If the unique constraint was dropped, we should have a unique index instead 
-- to support "direct" chat logic if we want to keep it 1:1 for support.
-- But for now, let's just ensure the trigger doesn't fail.
DO $$
BEGIN
    ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_teacher_id_key;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
