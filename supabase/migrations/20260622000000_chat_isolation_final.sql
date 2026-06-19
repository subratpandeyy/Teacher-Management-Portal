-- ══════════════════════════════════════════════════════════════════════════════════
-- Migration: Chat Isolation Final — Fix all remaining leak paths
-- 
-- This migration closes all identified gaps:
--   1. Post-cleanup type recomputation for conversations that had excess
--      participants removed by the previous migration's cleanup step.
--   2. Authorization check added to mark_conversation_as_read RPC.
--   3. Dead variables removed from ensure_direct_conversation.
--   4. Admin UPDATE/DELETE bypass policy on chat_messages.
--   5. Additional indexes for participant-based lookups.
-- ══════════════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════════════
-- 1. Post-cleanup type recomputation
--    After the previous migration's cleanup (Section 13) removed excess
--    participants from 3+ participant direct conversations, those conversations
--    still have type 'direct' but may have a different pairing (e.g., admin+coordinator
--    kept but type is 'direct' instead of 'coordinator_admin').
--    This step recomputes types for ALL 2-participant non-group conversations
--    to ensure correct role-based typing.
-- ══════════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  rec RECORD;
  v_type public.conversation_type;
  v_fixed BIGINT := 0;
  v_skipped BIGINT := 0;
BEGIN
  FOR rec IN
    SELECT cp.conversation_id, array_agg(cp.profile_id ORDER BY cp.profile_id) as pids
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE c.type IS DISTINCT FROM 'group'
    GROUP BY cp.conversation_id
    HAVING COUNT(*) = 2
  LOOP
    v_type := public.determine_conversation_type(rec.pids[1], rec.pids[2]);

    UPDATE public.conversations
    SET type = v_type
    WHERE id = rec.conversation_id
      AND (type IS NULL OR type <> v_type OR type = 'direct');

    IF FOUND THEN
      v_fixed := v_fixed + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Post-cleanup type recomputation: % conversation(s) updated, % already correct', v_fixed, v_skipped;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 2. Fix mark_conversation_as_read — add authorization check
--    Previously, any authenticated user could mark any conversation as read
--    for any user_id. Now requires matching auth.uid() or admin.
-- ══════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_conversation_as_read(p_conversation_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.conversation_participants
  SET last_read_at = NOW()
  WHERE conversation_id = p_conversation_id AND profile_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_as_read(UUID, UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 3. Remove dead variables from ensure_direct_conversation
-- ══════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.ensure_direct_conversation(
  p_user_a UUID,
  p_user_b UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_conv_id UUID;
  v_caller UUID;
  v_type public.conversation_type;
  v_hash UUID;
BEGIN
  IF p_user_a IS NULL OR p_user_b IS NULL THEN
    RAISE EXCEPTION 'Both user IDs required';
  END IF;

  IF p_user_a = p_user_b THEN
    RAISE EXCEPTION 'Cannot create conversation with self';
  END IF;

  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the caller is one of the participants or an admin
  IF v_caller NOT IN (p_user_a, p_user_b) AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Determine the conversation type from the two participants' roles
  v_type := public.determine_conversation_type(p_user_a, p_user_b);

  -- Compute deterministic hash for duplicate prevention
  v_hash := public.direct_conversation_hash(p_user_a, p_user_b);

  -- Check if a conversation already exists via hash (fast path)
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE participant_hash = v_hash AND (type IS NULL OR type = v_type);

  -- Fallback: check via participant join (legacy conversations without hash)
  IF v_conv_id IS NULL THEN
    SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp2.conversation_id = cp1.conversation_id
     AND cp2.profile_id = p_user_b
    JOIN public.conversations c ON c.id = cp1.conversation_id
    WHERE cp1.profile_id = p_user_a
      AND (c.type IS NULL OR c.type = v_type)
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_conv_id IS NULL THEN
    -- Assignment check: only allow creating new conversations within assignment relationships
    IF NOT public.can_chat_with(p_user_a, p_user_b) AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'You can only chat with users you are assigned to';
    END IF;

    INSERT INTO public.conversations (type, participant_hash)
    VALUES (v_type, v_hash)
    RETURNING id INTO v_conv_id;
  END IF;

  -- Add exactly the two participants
  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv_id, p_user_a), (v_conv_id, p_user_b)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  -- Remove any participant added by legacy code (e.g. ensure_teacher_conversation)
  DELETE FROM public.conversation_participants
  WHERE conversation_id = v_conv_id
    AND profile_id NOT IN (p_user_a, p_user_b);

  -- Update the type in case it changed (e.g. legacy 'direct' → 'teacher_coordinator')
  UPDATE public.conversations
  SET type = v_type
  WHERE id = v_conv_id AND (type IS NULL OR type = 'direct') AND type <> v_type;

  RETURN v_conv_id;
END;
$$;

ALTER FUNCTION public.ensure_direct_conversation(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(UUID, UUID) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════════
-- 4. Add admin UPDATE/DELETE bypass policy on chat_messages
--    The existing chat_messages_teacher_update_own and
--    chat_messages_teacher_delete_own policies only allow the message sender
--    to edit/delete. Admins need their own bypass to manage messages.
-- ══════════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Admins can update any chat message" ON public.chat_messages;
CREATE POLICY "Admins can update any chat message" ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can delete any chat message" ON public.chat_messages;
CREATE POLICY "Admins can delete any chat message" ON public.chat_messages
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- ══════════════════════════════════════════════════════════════════════════════════
-- 5. Add index on conversation_participants for faster participant lookups
-- ══════════════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_conversation_participants_profile_id
  ON public.conversation_participants (profile_id);

-- ══════════════════════════════════════════════════════════════════════════════════
-- 6. Verify: report all conversations with their participants and types
-- ══════════════════════════════════════════════════════════════════════════════════
SELECT
  c.id,
  c.type,
  c.participant_hash,
  COUNT(cp.id) as participant_count,
  array_agg(p.role || ':' || p.display_name ORDER BY p.display_name) as participants
FROM public.conversations c
LEFT JOIN public.conversation_participants cp ON cp.conversation_id = c.id
LEFT JOIN public.profiles p ON p.id = cp.profile_id
GROUP BY c.id, c.type, c.participant_hash
ORDER BY c.type, c.id;
