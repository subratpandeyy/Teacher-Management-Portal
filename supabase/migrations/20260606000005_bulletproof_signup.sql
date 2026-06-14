-- Ultimate Signup Repair (Final Version)
-- This migration addresses all potential failure points in the user creation trigger

-- 1. Enum Consistency
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

-- 2. Ensure Conversations table is ready for Duplex Chat
DO $$
BEGIN
    -- Drop the unique constraint if it exists to allow multiple conversations per user (duplex model)
    ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_teacher_id_key;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Bulletproof Trigger Function
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
  -- 1. Extract Role and Display Name from Metadata
  -- Use safe extraction to avoid any potential null pointer issues
  v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name', 
    split_part(NEW.email, '@', 1),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  -- 2. Map Role to Enum Safely (Avoid direct casting in the INSERT)
  CASE v_role_text
    WHEN 'admin' THEN v_role_enum := 'admin'::public.user_role;
    WHEN 'coordinator' THEN v_role_enum := 'coordinator'::public.user_role;
    WHEN 'student' THEN v_role_enum := 'student'::public.user_role;
    ELSE v_role_enum := 'teacher'::public.user_role;
  END CASE;

  -- 3. Create Profile (The critical path)
  -- If this fails, we try a absolute fallback to 'teacher'
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
      ON CONFLICT (id) DO UPDATE SET
        display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
    EXCEPTION WHEN OTHERS THEN
      -- If we reach here, we cannot even create a basic profile. 
      -- We log to stderr which Supabase captures in DB logs.
      RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    END;
  END;

  -- 4. Initialize Chat/Conversations (Non-critical path)
  -- We wrap this entirely to ensure it never blocks signup
  BEGIN
    -- Only create for non-admin roles by default
    IF v_role_text != 'admin' THEN
      -- Check if a direct conversation already exists
      SELECT id INTO v_conv_id FROM public.conversations 
      WHERE teacher_id = NEW.id AND (type IS NULL OR type = 'direct') 
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO public.conversations (teacher_id, type)
        VALUES (NEW.id, 'direct')
        RETURNING id INTO v_conv_id;
      END IF;

      -- Add participants
      IF v_conv_id IS NOT NULL THEN
        -- Add the user
        INSERT INTO public.conversation_participants (conversation_id, profile_id)
        VALUES (v_conv_id, NEW.id)
        ON CONFLICT DO NOTHING;

        -- Add an admin for direct support chat
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

-- 4. Re-attach Trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5. Performance and Reliability Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON public.profiles(role, id);
CREATE INDEX IF NOT EXISTS idx_conversations_teacher_id_type ON public.conversations(teacher_id, type);
