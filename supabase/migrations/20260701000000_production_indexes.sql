-- Optimizing chat messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_created
ON public.chat_messages(conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_sender
ON public.chat_messages(sender_id);

-- Optimizing attendance queries
CREATE INDEX IF NOT EXISTS idx_attendance_date_status
ON public.attendance(date, status);

-- Optimizing profiles queries
CREATE INDEX IF NOT EXISTS idx_profiles_role_deleted
ON public.profiles(role, deleted_at);

-- Optimizing tasks queries
CREATE INDEX IF NOT EXISTS idx_tasks_status_created
ON public.tasks(status, created_at DESC);

-- Optimizing assignments
CREATE INDEX IF NOT EXISTS idx_teacher_student_assignments_composite
ON public.teacher_student_assignments(teacher_id, student_id);

-- Note: group_members only contains group_id and teacher_id.
-- Indexes for group_members are already defined in earlier migrations.

-- Optimizing conversations
CREATE INDEX IF NOT EXISTS idx_conversations_created
ON public.conversations(created_at DESC);
