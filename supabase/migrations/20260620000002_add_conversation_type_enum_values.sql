-- Add new conversation type enum values in their own transaction
-- so they can be used in subsequent migrations.
-- PostgreSQL requires ALTER TYPE ... ADD VALUE to be committed
-- before the new values can be referenced.

DO $$
BEGIN
  ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'teacher_coordinator';
  ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'student_coordinator';
  ALTER TYPE public.conversation_type ADD VALUE IF NOT EXISTS 'coordinator_admin';
EXCEPTION WHEN duplicate_object THEN NULL;
END;
$$;
