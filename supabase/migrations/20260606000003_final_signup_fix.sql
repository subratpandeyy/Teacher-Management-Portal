-- Final Signup Fix Migration
-- Ensures robust user creation regardless of enum state or existing constraints

-- 1. Try to add missing enum values individually (non-transactional in spirit)
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

-- 2. Create an extremely robust handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_role TEXT;
  v_display_name TEXT;
  v_conv_id UUID;
  v_admin_id UUID;
BEGIN
  -- 1. Extract and validate role
  v_requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  IF v_requested_role NOT IN ('admin', 'coordinator', 'teacher', 'student') THEN
    v_requested_role := 'teacher';
  END IF;

  -- 2. Extract and validate display_name
  v_display_name := COALESCE(
    NEW.raw_user_meta_data->>'display_name', 
    split_part(NEW.email, '@', 1),
    'User_' || substr(NEW.id::text, 1, 8)
  );

  -- 3. Insert Profile with extreme error handling
  BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
      NEW.id,
      v_requested_role::public.user_role,
      v_display_name
    )
    ON CONFLICT (id) DO UPDATE SET
      role = EXCLUDED.role,
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
  EXCEPTION WHEN OTHERS THEN
    -- Fallback to 'teacher' if the cast fails (enum missing values)
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
      NEW.id,
      'teacher'::public.user_role,
      v_display_name
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = COALESCE(profiles.display_name, EXCLUDED.display_name);
  END;

  -- 4. Ensure Direct Conversation exists
  -- We search for an existing direct conversation for this user
  BEGIN
    SELECT id INTO v_conv_id 
    FROM public.conversations 
    WHERE teacher_id = NEW.id AND type = 'direct'
    LIMIT 1;

    IF v_conv_id IS NULL THEN
      INSERT INTO public.conversations (teacher_id, type)
      VALUES (NEW.id, 'direct')
      RETURNING id INTO v_conv_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If conversation creation fails, we don't want to block signup
    v_conv_id := NULL;
  END;

  -- 5. Add Participants if conversation was created/found
  IF v_conv_id IS NOT NULL THEN
    BEGIN
      -- Add the user themselves
      INSERT INTO public.conversation_participants (conversation_id, profile_id)
      VALUES (v_conv_id, NEW.id)
      ON CONFLICT DO NOTHING;

      -- Add the first found admin as the other party for the "direct" chat
      SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
      IF v_admin_id IS NOT NULL AND v_admin_id != NEW.id THEN
        INSERT INTO public.conversation_participants (conversation_id, profile_id)
        VALUES (v_conv_id, v_admin_id)
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Non-critical for signup
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Ensure the trigger is properly attached (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 4. Final Cleanup: Ensure conversations table is not blocking
DO $$
BEGIN
    -- Ensure the old unique constraint is gone to allow the new duplex model
    ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_teacher_id_key;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
