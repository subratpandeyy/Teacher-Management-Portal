-- Migration: Fix handle_new_group_conversation trigger and conversations schema
-- Date: 2026-06-14
--
-- Problem: conversations.teacher_id had NOT NULL constraint.
-- The handle_new_group_conversation trigger was creating group conversations
-- without a teacher_id, causing a NOT NULL violation on every group insert.
--
-- Fix:
--   1. Make conversations.teacher_id nullable (group conversations have no single owner).
--   2. Update the trigger to explicitly pass teacher_id = NULL for group-type rows.

-- 1. Make teacher_id nullable for group conversations
ALTER TABLE public.conversations ALTER COLUMN teacher_id DROP NOT NULL;

-- 2. Fix the trigger body to explicitly set teacher_id = NULL for group conversations
CREATE OR REPLACE FUNCTION public.handle_new_group_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id UUID;
BEGIN
  -- Insert group conversation; teacher_id is NULL (group type has no single owner)
  INSERT INTO public.conversations (group_id, type, name, teacher_id)
  VALUES (NEW.id, 'group', NEW.name, NULL)
  RETURNING id INTO v_conv_id;

  -- Add the group creator as the first participant
  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv_id, NEW.created_by)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
