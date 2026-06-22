-- Refactoring admin_assign_document_to_target to use bulk INSERT instead of LOOP
CREATE OR REPLACE FUNCTION public.admin_assign_document_to_target(
    p_document_id UUID,
    p_target_type public.document_target_type,
    p_target_id UUID,
    p_assigned_by UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ids UUID[];
BEGIN
    IF p_target_type = 'teacher' THEN
        v_ids := ARRAY[p_target_id];
    ELSIF p_target_type = 'student' THEN
        v_ids := ARRAY[p_target_id];
    ELSIF p_target_type = 'coordinator' THEN
        v_ids := ARRAY[p_target_id];
    ELSIF p_target_type = 'group' THEN
        SELECT array_agg(DISTINCT user_id) INTO v_ids
        FROM (
            SELECT teacher_id AS user_id FROM group_members WHERE group_id = p_target_id AND teacher_id IS NOT NULL
            UNION
            SELECT student_id AS user_id FROM group_members WHERE group_id = p_target_id AND student_id IS NOT NULL
        ) sub;
    END IF;

    IF v_ids IS NOT NULL AND array_length(v_ids, 1) > 0 THEN
        INSERT INTO document_recipients (document_id, target_id, target_type, assigned_by)
        SELECT p_document_id, unnest(v_ids), p_target_type, p_assigned_by
        ON CONFLICT (document_id, target_id) DO NOTHING;
    END IF;
END;
$$;

-- Refactoring admin_create_broadcast to use bulk INSERT
CREATE OR REPLACE FUNCTION public.admin_create_broadcast(
    p_title text,
    p_message text,
    p_target_type text,
    p_target_id uuid,
    p_created_by uuid,
    p_attachment_url text DEFAULT NULL,
    p_attachment_name text DEFAULT NULL,
    p_scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_broadcast_id uuid;
    v_target_ids uuid[];
BEGIN
    -- 1. Insert the broadcast
    INSERT INTO broadcasts (
        title,
        message,
        target_type,
        target_id,
        created_by,
        attachment_url,
        attachment_name,
        scheduled_for
    )
    VALUES (
        p_title,
        p_message,
        p_target_type::broadcast_target_type,
        p_target_id,
        p_created_by,
        p_attachment_url,
        p_attachment_name,
        p_scheduled_for
    )
    RETURNING id INTO v_broadcast_id;

    -- 2. Determine recipients
    IF p_target_type = 'all_teachers' THEN
        SELECT array_agg(id) INTO v_target_ids
        FROM profiles
        WHERE role = 'teacher' AND deleted_at IS NULL;

    ELSIF p_target_type = 'all_students' THEN
        SELECT array_agg(id) INTO v_target_ids
        FROM profiles
        WHERE role = 'student' AND deleted_at IS NULL;

    ELSIF p_target_type = 'all_coordinators' THEN
        SELECT array_agg(id) INTO v_target_ids
        FROM profiles
        WHERE role = 'coordinator' AND deleted_at IS NULL;

    ELSIF p_target_type = 'group' THEN
        SELECT array_agg(DISTINCT user_id) INTO v_target_ids
        FROM (
            SELECT teacher_id AS user_id FROM group_members WHERE group_id = p_target_id AND teacher_id IS NOT NULL
            UNION
            SELECT student_id AS user_id FROM group_members WHERE group_id = p_target_id AND student_id IS NOT NULL
        ) sub;

    ELSIF p_target_type IN ('specific_teacher', 'specific_student', 'specific_coordinator') THEN
        v_target_ids := ARRAY[p_target_id];
    END IF;

    -- 3. Bulk insert recipients
    IF v_target_ids IS NOT NULL AND array_length(v_target_ids, 1) > 0 THEN
        INSERT INTO broadcast_recipients (broadcast_id, teacher_id)
        SELECT v_broadcast_id, unnest(v_target_ids)
        ON CONFLICT (broadcast_id, teacher_id) DO NOTHING;
    END IF;

    RETURN v_broadcast_id;
END;
$$;
