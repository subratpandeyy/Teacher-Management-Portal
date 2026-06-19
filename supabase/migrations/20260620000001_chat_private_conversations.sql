-- ──────────────────────────────────────────────────────────────────────────────
-- Migration: Private Conversation Model — assignment-based access control,
-- duplicate prevention, auto-repair, and RLS hardening.
-- ──────────────────────────────────────────────────────────────────────────────

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Helper: deterministic hash for a pair of user IDs (sorted alphabetically)
--    Used to guarantee exactly one direct conversation per unique pair.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.direct_conversation_hash(p_user_a UUID, p_user_b UUID)
RETURNS UUID
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT md5(
    LEAST(p_user_a::text, p_user_b::text) ||
    GREATEST(p_user_a::text, p_user_b::text)
  )::UUID;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Add participant_hash column + unique index for direct conversations
-- ═════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS participant_hash UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_direct_participant_hash
  ON public.conversations (participant_hash)
  WHERE type = 'direct' AND participant_hash IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Auto-compute participant_hash on INSERT for direct conversations
--    (works for RPCs that bypass the public insert path, but exists as a guard)
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.conversations_set_participant_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participants UUID[];
BEGIN
  IF (NEW.type IS NULL OR NEW.type = 'direct') THEN
    SELECT ARRAY_AGG(profile_id ORDER BY profile_id) INTO v_participants
    FROM public.conversation_participants
    WHERE conversation_id = NEW.id;

    IF array_length(v_participants, 1) = 2 THEN
      NEW.participant_hash := public.direct_conversation_hash(v_participants[1], v_participants[2]);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_conversations_set_participant_hash ON public.conversations;
CREATE TRIGGER trigger_conversations_set_participant_hash
  BEFORE INSERT OR UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.conversations_set_participant_hash();

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Trigger: ensure participant_hash stays in sync when participants change
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
  IF v_type IS NULL OR v_type = 'direct' THEN
    SELECT ARRAY_AGG(profile_id ORDER BY profile_id) INTO v_participants
    FROM public.conversation_participants
    WHERE conversation_id = COALESCE(NEW.conversation_id, OLD.conversation_id);

    IF array_length(v_participants, 1) = 2 THEN
      v_hash := public.direct_conversation_hash(v_participants[1], v_participants[2]);
    END IF;

    UPDATE public.conversations SET participant_hash = v_hash
    WHERE id = COALESCE(NEW.conversation_id, OLD.conversation_id)
      AND (type IS NULL OR type = 'direct');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_conversation_participants_sync_hash ON public.conversation_participants;
CREATE TRIGGER trigger_conversation_participants_sync_hash
  AFTER INSERT OR DELETE ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.conversation_participants_sync_hash();

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Enforce direct conversations have exactly two participants
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
  IF v_type IS NULL OR v_type = 'direct' THEN
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

DROP TRIGGER IF EXISTS trigger_enforce_direct_conversation_participants ON public.conversation_participants;
CREATE TRIGGER trigger_enforce_direct_conversation_participants
  AFTER INSERT ON public.conversation_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_direct_conversation_participants();

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Assignment-based access control for direct conversations
--    Returns TRUE if the two users are allowed to chat directly.
--    Admins bypass all restrictions.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_chat_with(p_user_a UUID, p_user_b UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
STABLE
AS $$
DECLARE
  v_role_a public.user_role;
  v_role_b public.user_role;
BEGIN
  IF p_user_a IS NULL OR p_user_b IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_user_a = p_user_b THEN
    RETURN FALSE;
  END IF;

  -- Admins can chat with anyone
  IF public.is_admin() THEN
    RETURN TRUE;
  END IF;

  SELECT role INTO v_role_a FROM public.profiles WHERE id = p_user_a;
  SELECT role INTO v_role_b FROM public.profiles WHERE id = p_user_b;

  -- Admin participants bypass restrictions
  IF v_role_a = 'admin' OR v_role_b = 'admin' THEN
    RETURN TRUE;
  END IF;

  -- Coordinator ←→ Assigned Teacher
  IF (v_role_a = 'coordinator' AND v_role_b = 'teacher') THEN
    RETURN public.belongs_to_coordinator(p_user_b, p_user_a);
  END IF;
  IF (v_role_b = 'coordinator' AND v_role_a = 'teacher') THEN
    RETURN public.belongs_to_coordinator(p_user_a, p_user_b);
  END IF;

  -- Coordinator ←→ Assigned Student
  IF (v_role_a = 'coordinator' AND v_role_b = 'student') THEN
    RETURN public.belongs_to_coordinator(p_user_b, p_user_a);
  END IF;
  IF (v_role_b = 'coordinator' AND v_role_a = 'student') THEN
    RETURN public.belongs_to_coordinator(p_user_a, p_user_b);
  END IF;

  -- Coordinator ←→ Coordinator (cross-coordination)
  IF v_role_a = 'coordinator' AND v_role_b = 'coordinator' THEN
    RETURN TRUE;
  END IF;

  -- Teacher ←→ Assigned Student
  IF v_role_a = 'teacher' AND v_role_b = 'student' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.teacher_student_assignments
      WHERE teacher_id = p_user_a AND student_id = p_user_b
    );
  END IF;
  IF v_role_b = 'teacher' AND v_role_a = 'student' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.teacher_student_assignments
      WHERE teacher_id = p_user_b AND student_id = p_user_a
    );
  END IF;

  RETURN FALSE;
END;
$$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Updated ensure_direct_conversation with assignment check + hash dedup
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
  v_role_caller public.user_role;
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

  -- Compute deterministic hash for duplicate prevention
  v_hash := public.direct_conversation_hash(p_user_a, p_user_b);

  -- Check if a conversation already exists via hash (fast path)
  SELECT id INTO v_conv_id
  FROM public.conversations
  WHERE participant_hash = v_hash AND (type IS NULL OR type = 'direct');

  -- Fallback: check via participant join (for existing conversations without hash)
  IF v_conv_id IS NULL THEN
    SELECT cp1.conversation_id INTO v_conv_id
    FROM public.conversation_participants cp1
    JOIN public.conversation_participants cp2
      ON cp2.conversation_id = cp1.conversation_id
     AND cp2.profile_id = p_user_b
    JOIN public.conversations c ON c.id = cp1.conversation_id
    WHERE cp1.profile_id = p_user_a
      AND (c.type IS NULL OR c.type = 'direct')
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_conv_id IS NULL THEN
    -- Assignment check: only allow creating new conversations within assignment relationships
    IF NOT public.can_chat_with(p_user_a, p_user_b) AND NOT public.is_admin() THEN
      RAISE EXCEPTION 'You can only chat with users you are assigned to';
    END IF;

    INSERT INTO public.conversations (teacher_id, type, participant_hash)
    VALUES (p_user_a, 'direct', v_hash)
    RETURNING id INTO v_conv_id;
  END IF;

  -- Add participants (ensures exactly the two users are participants)
  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conv_id, p_user_a), (v_conv_id, p_user_b)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  -- Clean up any excess participants (should not happen, but guard against it)
  DELETE FROM public.conversation_participants
  WHERE conversation_id = v_conv_id
    AND profile_id NOT IN (p_user_a, p_user_b);

  RETURN v_conv_id;
END;
$$;

ALTER FUNCTION public.ensure_direct_conversation(UUID, UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_direct_conversation(UUID, UUID) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 8. Updated ensure_teacher_conversation with hash dedup
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
  v_hash UUID;
BEGIN
  PERFORM set_config('row_security', 'off', true);

  v_caller := auth.uid();

  IF p_teacher_id IS NULL THEN
    RAISE EXCEPTION 'teacher_id required';
  END IF;

  IF v_caller IS DISTINCT FROM p_teacher_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Ensure admin exists
  SELECT p.id INTO v_admin_id FROM public.profiles p WHERE p.role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'No admin found';
  END IF;

  -- Compute deterministic hash
  v_hash := public.direct_conversation_hash(p_teacher_id, v_admin_id);

  -- Search by hash first (fast path), then by participant membership
  SELECT id INTO v_id
  FROM public.conversations
  WHERE participant_hash = v_hash AND (type IS NULL OR type = 'direct');

  IF v_id IS NULL THEN
    SELECT cp.conversation_id INTO v_id
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE cp.profile_id = p_teacher_id
      AND (c.type IS NULL OR c.type = 'direct')
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (teacher_id, type, participant_hash)
    VALUES (p_teacher_id, 'direct', v_hash)
    RETURNING id INTO v_id;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_id, p_teacher_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  IF v_admin_id IS NOT NULL AND v_admin_id <> p_teacher_id THEN
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES (v_id, v_admin_id)
    ON CONFLICT (conversation_id, profile_id) DO NOTHING;
  END IF;

  IF v_caller IS NOT NULL AND v_caller <> p_teacher_id AND v_caller <> v_admin_id THEN
    INSERT INTO public.conversation_participants (conversation_id, profile_id)
    VALUES (v_id, v_caller)
    ON CONFLICT (conversation_id, profile_id) DO NOTHING;
  END IF;

  -- Clean up excess participants — direct conversations must have exactly 2
  DELETE FROM public.conversation_participants
  WHERE conversation_id = v_id
    AND profile_id NOT IN (p_teacher_id, v_admin_id, v_caller);

  RETURN v_id;
END;
$$;

ALTER FUNCTION public.ensure_teacher_conversation(UUID) OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.ensure_teacher_conversation(UUID) TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 9. Hardened RLS Policies
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 9a. conversations SELECT: only participants can see a conversation ──────
DROP POLICY IF EXISTS "Users can view conversations they participate in" ON public.conversations;
CREATE POLICY "Users can view conversations they participate in"
  ON public.conversations
  FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(id, auth.uid())
    OR public.is_admin()
  );

-- ── 9b. chat_messages SELECT: only participants can read messages ──────────
-- Note: already correct via is_conversation_participant, re-dropping for clarity
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.chat_messages;
CREATE POLICY "Users can view messages in their conversations"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id, auth.uid())
    OR public.is_admin()
  );

-- ── 9c. chat_messages INSERT: only participants can send messages ──────────
-- Also: sender must match auth.uid() and assignment rules must allow it
DROP POLICY IF EXISTS "Users can send messages to their conversations" ON public.chat_messages;
CREATE POLICY "Users can send messages to their conversations"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      public.is_conversation_participant(conversation_id, auth.uid())
      OR public.is_admin()
    )
  );

-- ── 9d. conversation_participants SELECT: only participants can see members ─
DROP POLICY IF EXISTS "Users can view participants in their conversations" ON public.conversation_participants;
CREATE POLICY "Users can view participants in their conversations"
  ON public.conversation_participants
  FOR SELECT
  TO authenticated
  USING (
    public.is_conversation_participant(conversation_id, auth.uid())
    OR profile_id = auth.uid()
    OR public.is_admin()
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 10. Auto-repair: audit and fix invalid direct conversations
--     Logs any direct conversation with <2 or >2 participants and repairs them.
-- ═════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.audit_and_repair_direct_conversations()
RETURNS TABLE (
  conversation_id UUID,
  participant_count BIGINT,
  action TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  rec RECORD;
  v_participants UUID[];
  v_keep UUID[];
  v_removed INTEGER;
BEGIN
  FOR rec IN
    SELECT cp.conversation_id, COUNT(*) as cnt, array_agg(cp.profile_id ORDER BY cp.created_at) as pids
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE (c.type IS NULL OR c.type = 'direct')
    GROUP BY cp.conversation_id
    HAVING COUNT(*) <> 2
  LOOP
    conversation_id := rec.conversation_id;
    participant_count := rec.cnt;

    IF rec.cnt < 2 THEN
      -- Orphaned conversation — soft-delete or log
      action := 'WARNING: direct conversation has ' || rec.cnt || ' participant(s), insufficient for messaging';

      IF rec.cnt = 0 THEN
        DELETE FROM public.conversations WHERE id = rec.conversation_id;
        action := 'DELETED: empty direct conversation';
      END IF;
    ELSE
      -- More than 2 participants — keep the first 2, remove the rest
      v_keep := rec.pids[1:2];

      DELETE FROM public.conversation_participants
      WHERE conversation_id = rec.conversation_id
        AND profile_id = ANY(rec.pids[3:]);

      GET DIAGNOSTICS v_removed = ROW_COUNT;

      -- Update participant_hash
      UPDATE public.conversations SET participant_hash = public.direct_conversation_hash(v_keep[1], v_keep[2])
      WHERE id = rec.conversation_id AND (type IS NULL OR type = 'direct');

      action := 'REPAIRED: removed ' || v_removed || ' excess participant(s), kept 2';
    END IF;

    RAISE WARNING 'audit_and_repair_direct_conversations: conv=%, count=%, action=%', rec.conversation_id, rec.cnt, action;
    RETURN NEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.audit_and_repair_direct_conversations() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════════
-- 11. Backfill participant_hash for existing direct conversations
-- ═════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  rec RECORD;
  v_participants UUID[];
BEGIN
  FOR rec IN
    SELECT cp.conversation_id, array_agg(cp.profile_id ORDER BY cp.profile_id) as pids
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE (c.type IS NULL OR c.type = 'direct')
      AND c.participant_hash IS NULL
    GROUP BY cp.conversation_id
    HAVING COUNT(*) = 2
  LOOP
    UPDATE public.conversations
    SET participant_hash = public.direct_conversation_hash(rec.pids[1], rec.pids[2])
    WHERE id = rec.conversation_id;
  END LOOP;

  -- Log conversations that could not be backfilled
  FOR rec IN
    SELECT cp.conversation_id, COUNT(*) as cnt
    FROM public.conversation_participants cp
    JOIN public.conversations c ON c.id = cp.conversation_id
    WHERE (c.type IS NULL OR c.type = 'direct')
      AND c.participant_hash IS NULL
    GROUP BY cp.conversation_id
  LOOP
    RAISE WARNING 'Backfill skipped: conversation % has % participants (need exactly 2)', rec.conversation_id, rec.cnt;
  END LOOP;
END;
$$;

-- Also trigger the repair to clean up any existing invalid conversations
SELECT public.audit_and_repair_direct_conversations();
