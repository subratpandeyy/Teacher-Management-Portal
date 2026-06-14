-- Final Cleanup and Robust Signup Trigger
-- This migration ensures the user_role enum is correct and implements an ultra-safe trigger

-- 1. Ensure Enum Values (Individually to handle transaction constraints)
DO $$ 
BEGIN
  BEGIN
    ALTER TYPE public.user_role ADD VALUE 'coordinator';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

DO $$ 
BEGIN
  BEGIN
    ALTER TYPE public.user_role ADD VALUE 'student';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

-- 2. Ultra-Safe Trigger Function
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
BEGIN
  -- 1. Determine Role (Text first)
  v_role_text := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  
  -- 2. Map to Enum Safely
  CASE v_role_text
    WHEN 'admin' THEN v_role_enum := 'admin'::public.user_role;
    WHEN 'coordinator' THEN v_role_enum := 'coordinator'::public.user_role;
    WHEN 'student' THEN v_role_enum := 'student'::public.user_role;
    ELSE v_role_enum := 'teacher'::public.user_role;
  END CASE;

  -- 3. Determine Display Name
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name', 
    split_part(NEW.email, '@', 1),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  -- 4. Insert Profile (Primary Task)
  -- We wrap this in a block to ensure we return NEW even if everything else fails
  BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (NEW.id, v_role_enum, v_display_name)
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
  EXCEPTION WHEN OTHERS THEN
    -- If the above fails (e.g. enum value still missing), try one last time with 'teacher'
    BEGIN
      INSERT INTO public.profiles (id, role, display_name)
      VALUES (NEW.id, 'teacher'::public.user_role, v_display_name)
      ON CONFLICT (id) DO UPDATE SET
        display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
    EXCEPTION WHEN OTHERS THEN
      -- Absolute last resort: do nothing, but don't crash the trigger
      NULL;
    END;
  END;

  -- 5. Secondary Tasks (Conversations/Participants)
  -- Wrapped in a separate block so they don't block the profile creation
  BEGIN
    -- Only create conversations for roles that need them (teacher, student, coordinator)
    -- This avoids creating "direct" chats for admins if not desired, 
    -- and simplifies the logic.
    IF v_role_text IN ('teacher', 'student', 'coordinator') THEN
      -- Find or Create Conversation
      SELECT id INTO v_conv_id 
      FROM public.conversations 
      WHERE teacher_id = NEW.id 
      LIMIT 1;

      IF v_conv_id IS NULL THEN
        INSERT INTO public.conversations (teacher_id)
        VALUES (NEW.id)
        RETURNING id INTO v_conv_id;
      END IF;

      -- Add Participant
      IF v_conv_id IS NOT NULL THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id)
        VALUES (v_conv_id, NEW.id)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Logically non-critical for signup
    NULL;
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

-- 4. Cleanup and Repair
-- Ensure conversations table allows multiple rows per teacher if unique constraint remains
DO $$
BEGIN
    ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_teacher_id_key;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 5. Add Index to help with lookups in trigger
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_conversations_teacher_id ON public.conversations(teacher_id);
