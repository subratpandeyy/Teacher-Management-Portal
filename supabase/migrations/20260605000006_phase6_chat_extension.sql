-- Phase 6: Duplex Chat Extension

-- 1. Add conversation type
DO $$ BEGIN
  CREATE TYPE public.conversation_type AS ENUM ('direct', 'group');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS type public.conversation_type DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.groups (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS name TEXT; -- For group names if different from group table

-- 2. Participants table for many-to-many relationships in conversations
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(conversation_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_conv_part_conv ON public.conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_part_profile ON public.conversation_participants(profile_id);

-- -- 3. Migration: Backfill participants from existing conversations
-- INSERT INTO public.conversation_participants (conversation_id, profile_id)
-- SELECT id, teacher_id FROM public.conversations
ON CONFLICT DO NOTHING;

-- Also add admin as participant to existing conversations (assuming admin is the other party)
-- DO $$
-- DECLARE
--   v_admin_id UUID;
-- BEGIN
--   SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
--   IF v_admin_id IS NOT NULL THEN
--     INSERT INTO public.conversation_participants (conversation_id, profile_id)
--     SELECT id, v_admin_id FROM public.conversations
    ON CONFLICT DO NOTHING;
--   END IF;
-- END $$;


-- 3. Migration: Backfill participants from existing conversations

INSERT INTO public.conversation_participants (
  conversation_id,
  profile_id
)
SELECT
  c.id,
  c.teacher_id
FROM public.conversations c
WHERE c.teacher_id IS NOT NULL
ON CONFLICT (conversation_id, profile_id) DO NOTHING;

DO $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT id
  INTO v_admin_id
  FROM public.profiles
  WHERE role = 'admin'
  LIMIT 1;

  IF v_admin_id IS NOT NULL THEN
    INSERT INTO public.conversation_participants (
      conversation_id,
      profile_id
    )
    SELECT
      c.id,
      v_admin_id
    FROM public.conversations c
    ON CONFLICT (conversation_id, profile_id) DO NOTHING;
  END IF;
END $$;

-- 4. Update chat_messages trigger to handle multiple participant types
CREATE OR REPLACE FUNCTION public.chat_messages_set_receiver()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_type public.conversation_type;
  v_participant_count INTEGER;
BEGIN
  SELECT type INTO v_conv_type FROM public.conversations WHERE id = NEW.conversation_id;

  IF v_conv_type = 'group' THEN
    -- In group chats, receiver_id is NULL as it's broadcast to the group
    NEW.receiver_id := NULL;
  ELSE
    -- For direct chats, find the other participant
    SELECT profile_id INTO NEW.receiver_id
    FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id AND profile_id != NEW.sender_id
    LIMIT 1;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- 5. RLS for Duplex Chat
CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = chat_messages.conversation_id AND profile_id = auth.uid()
    ) OR public.is_admin()
  );

CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversation_participants
      WHERE conversation_id = chat_messages.conversation_id AND profile_id = auth.uid()
    ) OR public.is_admin()
  );
