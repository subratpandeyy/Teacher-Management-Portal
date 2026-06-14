-- Auth and Chat Repair Migration
-- Fixes role assignment in trigger and removes restrictive unique constraint on conversations

-- 1. Update handle_new_user to allow all roles from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role TEXT;
BEGIN
  -- Get role from metadata, default to 'teacher'
  requested_role := COALESCE(NEW.raw_user_meta_data->>'role', 'teacher');
  
  -- Validation: Ensure the role is valid for our enum
  -- If it's not a valid role, fallback to 'teacher'
  IF requested_role NOT IN ('admin', 'coordinator', 'teacher', 'student') THEN
    requested_role := 'teacher';
  END IF;

  INSERT INTO public.profiles (id, role, display_name)
  VALUES (
    NEW.id,
    requested_role::public.user_role,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );

  -- We still create a primary conversation for the user, but we'll remove the unique constraint next
  INSERT INTO public.conversations (teacher_id, type)
  VALUES (NEW.id, 'direct')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 2. Remove UNIQUE constraint from conversations.teacher_id
-- First, find the constraint name if it exists (usually it's conversations_teacher_id_key)
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_teacher_id_key;

-- 3. Ensure conversation_participants has the creator
-- This is already handled by Phase 6 migration usually, but good to be sure
INSERT INTO public.conversation_participants (conversation_id, profile_id)
SELECT id, teacher_id FROM public.conversations
ON CONFLICT (conversation_id, profile_id) DO NOTHING;
