-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Role-Based Conversation Isolation — typed conversations,
-- role-scoped RLS, participant validation, and backfill of existing data.
-- ──────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Extended conversation types
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'teacher_coordinator';
  ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'student_coordinator';
  ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'coordinator_admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Determine the correct conversation type for a pair of users
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.determine_conversation_type(p_user_a UUID, p_user_b UUID)
RETURNS public.conversation_type
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT CASE
    WHEN p1.role = 'teacher' AND p2.role = 'coordinator' THEN 'teacher_coordinator'::public.conversation_type
    WHEN p1.role = 'coordinator' AND p2.role = 'teacher' THEN 'teacher_coordinator'::public.conversation_type
    WHEN p1.role = 'student' AND p2.role = 'coordinator' THEN 'student_coordinator'::public.conversation_type
    WHEN p1.role = 'coordinator' AND p2.role = 'student' THEN 'student_coordinator'::public.conversation_type
    WHEN p1.role = 'coordinator' AND p2.role = 'admin' THEN 'coordinator_admin'::public.conversation_type
    WHEN p1.role = 'admin' AND p2.role = 'coordinator' THEN 'coordinator_admin'::public.conversation_type
    ELSE 'direct'::public.conversation_type
  END
  FROM public.profiles p1, public.profiles p2
  WHERE p1.id = p_user_a AND p2.id = p_user_b;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Role-based conversation access control
--    Returns TRUE only if the user is a participant AND the conversation type
--    is allowed for their role.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_access_conversation(p_conversation_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_type public.conversation_type;
  v_role public.user_role;
BEGIN
  -- Must be a participant first
  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND profile_id = p_profile_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- Admins can access every conversation they are a participant in
  SELECT role INTO v_role FROM public.profiles WHERE id = p_profile_id;
  IF v_role = 'admin' THEN
    RETURN TRUE;
  END IF;

  SELECT type INTO v_type FROM public.conversations WHERE id = p_conversation_id;

  -- Group conversations: accessible to any member (already verified participant)
  IF v_type = 'group' THEN
    RETURN TRUE;
  END IF;

  -- Teachers: can only access teacher_coordinator and direct conversations
  IF v_role = 'teacher' THEN
    RETURN v_type IN ('teacher_coordinator', 'direct');
  END IF;

  -- Students: can only access student_coordinator and direct conversations
  IF v_role = 'student' THEN
    RETURN v_type IN ('student_coordinator', 'direct');
  END IF;

  -- Coordinators: can access all non-group types + groups
  IF v_role = 'coordinator' THEN
    RETURN v_type IN ('teacher_coordinator', 'student_coordinator', 'coordinator_admin', 'direct', 'group');
  END IF;

  RETURN FALSE;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Rewrite ensure_direct_conversation — typed + fully isolated
--    Automatically determines conversation type from participant roles.
--    Guarantees exactly the two participants — never adds admin as third.
-- ═════════════════════════════════════════════════════════════════════════════
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
  v_role_a public.user_role;
  v_role_b public.user_role;
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

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Fix ensure_teacher_conversation — never create shared channels
--    Now delegates to ensure_direct_conversation for admin↔teacher conversations.
--    Removes the leak where coordinator, admin, and teacher were all added
--    to the same conversation.
-- ═════════════════════════════════════════════════════════════════════════════
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

  -- Delegate to ensure_direct_conversation for a clean 2-participant conversation.
  -- This creates a typed conversation (e.g. 'direct' for admin↔teacher)
  -- and never adds admin + coordinator + teacher all together.
  SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin found';
  END IF;

  -- Use ensure_direct_conversation between the caller and teacher if caller is not admin
  IF v_caller IS DISTINCT FROM v_admin_id AND v_caller IS DISTINCT FROM p_teacher_id THEN
    -- Non-admin caller wants a conversation with the teacher — use direct conversation
    v_id := public.ensure_direct_conversation(v_caller, p_teacher_id);
  ELSE
    -- Admin calling, or teacher calling themselves — use direct conversation with admin
    v_id := public.ensure_direct_conversation(p_teacher_id, v_admin_id);
  END IF;

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.ensure_teacher_conversation(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_teacher_conversation(UUID) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Hardened RLS policies — role-scoped access control
--    Every policy now checks can_access_conversation() which validates:
--    a) The user is a participant
--    b) The conversation type is allowed for the user's role
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 6a. conversations ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (public.can_access_conversation(id, auth.uid()));

-- ── 6b. chat_messages SELECT ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (public.can_access_conversation(conversation_id, auth.uid()));

-- ── 6c. chat_messages INSERT ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.chat_messages;
CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- ── 6d. chat_messages UPDATE (edit own) ──────────────────────────────────────
DROP POLICY IF EXISTS chat_messages_teacher_update_own ON public.chat_messages;
CREATE POLICY chat_messages_teacher_update_own ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND public.can_access_conversation(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND deleted_at IS NULL
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- ── 6e. chat_messages UPDATE (soft delete own) ───────────────────────────────
DROP POLICY IF EXISTS chat_messages_teacher_delete_own ON public.chat_messages;
CREATE POLICY chat_messages_teacher_delete_own ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_conversation(conversation_id, auth.uid())
  );

-- ── 6f. conversation_participants SELECT ─────────────────────────────────────
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_conversation(conversation_id, auth.uid())
    OR profile_id = auth.uid()
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Backend validation: reject messages from non-participants
--    BEFORE INSERT trigger that double-checks the sender is a participant
--    in the conversation. Acts as a defense-in-depth layer alongside RLS.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.chat_messages_validate_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS NULL THEN
    RAISE EXCEPTION 'sender_id is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id
      AND profile_id = NEW.sender_id
  ) THEN
    RAISE EXCEPTION 'Sender is not a participant in this conversation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_chat_messages_validate_sender ON public.chat_messages;
CREATE TRIGGER trigger_chat_messages_validate_sender
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_messages_validate_sender();

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Update get_user_conversations_with_unread — respect role-based visibility
--    The inner subquery already scopes by participant, but we add an
--    additional type filter to guarantee teachers never see coordinator_admin
--    conversations even if they are mistakenly a participant.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_user_conversations_with_unread(p_user_id UUID)
RETURNS TABLE (
  conversation_id UUID,
  name TEXT,
  type TEXT,
  group_id UUID,
  latest_message_body TEXT,
  latest_message_created_at TIMESTAMPTZ,
  latest_message_sender_name TEXT,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH user_convs AS (
    SELECT cp.conversation_id, cp.last_read_at, c.type, c.group_id, c.name as conv_name
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE cp.profile_id = p_user_id
      AND public.can_access_conversation(c.id, p_user_id)
  ),
  latest_msgs AS (
    SELECT DISTINCT ON (m.conversation_id)
      m.conversation_id,
      m.body,
      m.created_at,
      p.display_name as sender_name
    FROM public.chat_messages m
    LEFT JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.deleted_at IS NULL
    ORDER BY m.conversation_id, m.created_at DESC
  ),
  counts AS (
    SELECT m.conversation_id, COUNT(*) as cnt
    FROM public.chat_messages m
    JOIN user_convs uc ON uc.conversation_id = m.conversation_id
    WHERE m.sender_id <> p_user_id
      AND m.deleted_at IS NULL
      AND m.created_at > COALESCE(uc.last_read_at, '-infinity'::timestamptz)
    GROUP BY m.conversation_id
  )
  SELECT
    uc.conversation_id,
    COALESCE(
      CASE WHEN uc.type = 'direct' OR uc.type = 'teacher_coordinator'
                OR uc.type = 'student_coordinator' OR uc.type = 'coordinator_admin' THEN
        (SELECT p.display_name FROM public.conversation_participants cp2
         JOIN public.profiles p ON p.id = cp2.profile_id
         WHERE cp2.conversation_id = uc.conversation_id AND cp2.profile_id <> p_user_id LIMIT 1)
      ELSE
        (SELECT g.name FROM public.groups g WHERE g.id = uc.group_id)
      END,
      uc.conv_name,
      'Chat'
    )::TEXT as name,
    uc.type::TEXT,
    uc.group_id,
    lm.body::TEXT as latest_message_body,
    lm.created_at as latest_message_created_at,
    lm.sender_name::TEXT as latest_message_sender_name,
    COALESCE(cnts.cnt, 0::bigint) as unread_count
  FROM user_convs uc
  LEFT JOIN latest_msgs lm ON lm.conversation_id = uc.conversation_id
  LEFT JOIN counts cnts ON cnts.conversation_id = uc.conversation_id
  ORDER BY COALESCE(lm.created_at, '-infinity'::timestamptz) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_conversations_with_unread(UUID) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Auto-type trigger on conversation_participants
--    When a second participant is added to a 'direct' (or NULL) type
--    conversation, recompute the type from the participants' roles.
--    This ensures handle_new_user's conversations get the correct type.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.conversation_participants_auto_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.conversation_type;
  v_participants UUID[];
  v_p1 UUID;
  v_p2 UUID;
  v_current_type public.conversation_type;
BEGIN
  SELECT c.type INTO v_current_type FROM public.conversations c WHERE c.id = NEW.conversation_id;

  IF v_current_type = 'direct' OR v_current_type IS NULL THEN
    SELECT ARRAY_AGG(profile_id ORDER BY profile_id) INTO v_participants
    FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id;

    IF array_length(v_participants, 1) = 2 THEN
      v_p1 := v_participants[1];
      v_p2 := v_participants[2];
      v_type := public.determine_conversation_type(v_p1, v_p2);

      IF v_type IS DISTINCT FROM v_current_type THEN
        UPDATE public.conversations SET type = v_type
        WHERE id = NEW.conversation_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_conversation_participants_auto_type ON public.conversation_participants;
CREATE TRIGGER trigger_conversation_participants_auto_type
  AFTER INSERT ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.conversation_participants_auto_type();

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Backfill existing conversations with correct types
--    Scans every 2-participant direct conversation and updates the type
--    based on the participants' roles.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  rec RECORD;
  v_type public.conversation_type;
  v_user_a UUID;
  v_user_b UUID;
  v_fixed BIGINT := 0;
BEGIN
  FOR rec IN
    SELECT cp.conversation_id, array_agg(cp.profile_id ORDER BY cp.profile_id) as pids
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE (c.type IS NULL OR c.type = 'direct')
      AND c.type IS DISTINCT FROM 'group'
    GROUP BY cp.conversation_id
    HAVING COUNT(*) = 2
  LOOP
    v_user_a := rec.pids[1];
    v_user_b := rec.pids[2];
    v_type := public.determine_conversation_type(v_user_a, v_user_b);

    IF v_type IS DISTINCT FROM 'direct' THEN
      UPDATE public.conversations
      SET type = v_type
      WHERE id = rec.conversation_id AND (type IS NULL OR type = 'direct');
      v_fixed := v_fixed + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete: updated % conversation(s) to typed values', v_fixed;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. Update enforce_direct_conversation_participants to handle typed conversations
--     Also covers teacher_coordinator, student_coordinator, coordinator_admin.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.enforce_direct_conversation_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_type public.conversation_type;
BEGIN
  SELECT c.type INTO v_type FROM public.conversations c WHERE c.id = NEW.conversation_id;
  IF v_type IS NULL OR v_type IN ('direct', 'teacher_coordinator', 'student_coordinator', 'coordinator_admin') THEN
    SELECT COUNT(*) INTO v_count
    FROM public.conversation_participants
    WHERE conversation_id = NEW.conversation_id;

    IF v_count > 2 THEN
      RAISE EXCEPTION 'Direct conversations cannot have more than 2 participants (conversation: %, count: %)', NEW.conversation_id, v_count;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 12. Update participant_hash sync to handle typed conversations
--     Replaces the function from the previous migration to also compute
--     hashes for teacher_coordinator, student_coordinator, coordinator_admin.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.conversation_participants_sync_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.conversation_type;
  v_participants UUID[];
  v_hash UUID;
BEGIN
  SELECT c.type INTO v_type FROM public.conversations c WHERE c.id = COALESCE(NEW.conversation_id, OLD.conversation_id);
  IF v_type IS NULL OR v_type IN ('direct', 'teacher_coordinator', 'student_coordinator', 'coordinator_admin') THEN
    SELECT ARRAY_AGG(profile_id ORDER BY profile_id) INTO v_participants
    FROM public.conversation_participants
    WHERE conversation_id = COALESCE(NEW.conversation_id, OLD.conversation_id);

    IF array_length(v_participants, 1) = 2 THEN
      v_hash := public.direct_conversation_hash(v_participants[1], v_participants[2]);
    END IF;

    UPDATE public.conversations SET participant_hash = v_hash
    WHERE id = COALESCE(NEW.conversation_id, OLD.conversation_id)
      AND (type IS NULL OR type IN ('direct', 'teacher_coordinator', 'student_coordinator', 'coordinator_admin'));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 13. Cleanup: remove excess participants from direct conversations
--     Any conversation with type 'direct' (or the new typed equivalents) that
--     has more than 2 participants is repaired.
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  rec RECORD;
  v_keep UUID[];
  v_removed INTEGER;
BEGIN
  FOR rec IN
    SELECT cp.conversation_id, COUNT(*) as cnt,
           array_agg(cp.profile_id ORDER BY cp.created_at) as pids,
           c.type as conv_type
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE c.type IN ('direct', 'teacher_coordinator', 'student_coordinator', 'coordinator_admin')
       OR c.type IS NULL
    GROUP BY cp.conversation_id, c.type
    HAVING COUNT(*) > 2
  LOOP
    -- Keep the first 2 participants, remove the rest
    v_keep := rec.pids[1:2];

    DELETE FROM public.conversation_participants
    WHERE conversation_id = rec.conversation_id
      AND profile_id = ANY(rec.pids[3:]);

    GET DIAGNOSTICS v_removed = ROW_COUNT;
    RAISE WARNING 'Cleaned up conversation % (type=%): removed % excess participant(s), kept 2',
      rec.conversation_id, rec.conv_type, v_removed;
  END LOOP;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 14. Report: show final state of all conversations for auditing
-- ═════════════════════════════════════════════════════════════════════════════
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
