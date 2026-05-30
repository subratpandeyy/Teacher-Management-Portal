-- Optional: admin can broadcast inbox to a teacher (already covered by inbox_insert_admin)
-- Push notification trigger (notify teacher on new admin message)

CREATE OR REPLACE FUNCTION public.notify_teacher_on_inbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_notify(
    'teacher_inbox',
    json_build_object('teacher_id', NEW.teacher_id, 'id', NEW.id)::TEXT
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER inbox_notify
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_teacher_on_inbox();
