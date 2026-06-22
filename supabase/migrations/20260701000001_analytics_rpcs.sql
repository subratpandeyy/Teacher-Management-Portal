-- 1. Global Dashboard Metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH user_stats AS (
    SELECT 
      COUNT(*) FILTER (WHERE role = 'student') as total_students,
      COUNT(*) FILTER (WHERE role = 'teacher') as total_teachers,
      COUNT(*) FILTER (WHERE role = 'coordinator') as total_coordinators,
      COUNT(*) FILTER (WHERE role = 'admin') as total_admins
    FROM public.profiles
    WHERE deleted_at IS NULL
  ),
  task_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'overdue') as overdue
    FROM public.tasks
  ),
  attendance_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'present') as present,
      COUNT(*) FILTER (WHERE status = 'absent') as absent,
      COUNT(*) FILTER (WHERE status = 'late') as late
    FROM public.attendance
  ),
  group_stats AS (
    SELECT COUNT(*) as active_groups FROM public.groups
  ),
  broadcast_stats AS (
    SELECT COUNT(*) as total_broadcasts FROM public.broadcasts
  ),
  message_stats AS (
    SELECT COUNT(*) as messages_today 
    FROM public.chat_messages 
    WHERE created_at >= date_trunc('day', NOW())
  )
  SELECT jsonb_build_object(
    'users', jsonb_build_object(
      'totalStudents', u.total_students,
      'totalTeachers', u.total_teachers,
      'totalCoordinators', u.total_coordinators,
      'totalAdmins', u.total_admins
    ),
    'tasks', jsonb_build_object(
      'total', t.total,
      'pending', t.pending,
      'inProgress', t.in_progress,
      'completed', t.completed,
      'overdue', t.overdue,
      'completionRate', CASE WHEN t.total > 0 THEN ROUND((t.completed::numeric / t.total) * 100) ELSE 0 END
    ),
    'attendance', jsonb_build_object(
      'total', a.total,
      'present', a.present,
      'absent', a.absent,
      'late', a.late,
      'rate', CASE WHEN a.total > 0 THEN ROUND((a.present::numeric / a.total) * 100) ELSE 0 END
    ),
    'activeGroups', g.active_groups,
    'totalBroadcasts', b.total_broadcasts,
    'messagesToday', m.messages_today
  ) INTO result
  FROM user_stats u, task_stats t, attendance_stats a, group_stats g, broadcast_stats b, message_stats m;

  RETURN result;
END;
$$;

-- 2. User Growth Trend
CREATE OR REPLACE FUNCTION public.get_user_growth_trend(days INT DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH dates AS (
    SELECT generate_series(
      date_trunc('day', NOW() - (days * INTERVAL '1 day')),
      date_trunc('day', NOW()),
      INTERVAL '1 day'
    )::date AS day
  ),
  daily_counts AS (
    SELECT 
      date_trunc('day', created_at)::date AS day,
      COUNT(*) as new_users
    FROM public.profiles
    WHERE deleted_at IS NULL
    GROUP BY 1
  ),
  running_totals AS (
    SELECT 
      d.day,
      SUM(COALESCE(c.new_users, 0)) OVER (ORDER BY d.day) as total_users
    FROM dates d
    LEFT JOIN daily_counts c ON d.day = c.day
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', to_char(day, 'YYYY-MM-DD'),
      'count', total_users
    )
  ), '[]'::jsonb) INTO result
  FROM running_totals;

  RETURN result;
END;
$$;

-- 3. Task Trend
CREATE OR REPLACE FUNCTION public.get_task_trend(days INT DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH dates AS (
    SELECT generate_series(
      date_trunc('day', NOW() - (days * INTERVAL '1 day')),
      date_trunc('day', NOW()),
      INTERVAL '1 day'
    )::date AS day
  ),
  created_counts AS (
    SELECT 
      date_trunc('day', created_at)::date AS day,
      COUNT(*) as created
    FROM public.tasks
    GROUP BY 1
  ),
  completed_counts AS (
    SELECT 
      date_trunc('day', updated_at)::date AS day,
      COUNT(*) as completed
    FROM public.tasks
    WHERE status = 'completed'
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'created', COALESCE(cr.created, 0),
      'completed', COALESCE(co.completed, 0)
    )
  ), '[]'::jsonb) INTO result
  FROM dates d
  LEFT JOIN created_counts cr ON d.day = cr.day
  LEFT JOIN completed_counts co ON d.day = co.day;

  RETURN result;
END;
$$;

-- 4. Attendance Trend
CREATE OR REPLACE FUNCTION public.get_attendance_trend(days INT DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH dates AS (
    SELECT generate_series(
      date_trunc('day', NOW() - (days * INTERVAL '1 day')),
      date_trunc('day', NOW()),
      INTERVAL '1 day'
    )::date AS day
  ),
  attendance_counts AS (
    SELECT 
      date,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'present') as present,
      COUNT(*) FILTER (WHERE status = 'absent') as absent
    FROM public.attendance
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'present', COALESCE(a.present, 0),
      'absent', COALESCE(a.absent, 0),
      'rate', CASE WHEN COALESCE(a.total, 0) > 0 THEN ROUND((a.present::numeric / a.total) * 100) ELSE 0 END
    )
  ), '[]'::jsonb) INTO result
  FROM dates d
  LEFT JOIN attendance_counts a ON d.day = a.date;

  RETURN result;
END;
$$;

-- 5. Message Trend
CREATE OR REPLACE FUNCTION public.get_message_trend(days INT DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH dates AS (
    SELECT generate_series(
      date_trunc('day', NOW() - (days * INTERVAL '1 day')),
      date_trunc('day', NOW()),
      INTERVAL '1 day'
    )::date AS day
  ),
  message_counts AS (
    SELECT 
      date_trunc('day', created_at)::date AS day,
      COUNT(*) as count
    FROM public.chat_messages
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'date', to_char(d.day, 'YYYY-MM-DD'),
      'count', COALESCE(m.count, 0)
    )
  ), '[]'::jsonb) INTO result
  FROM dates d
  LEFT JOIN message_counts m ON d.day = m.day;

  RETURN result;
END;
$$;

-- 6. Teacher Dashboard Metrics
CREATE OR REPLACE FUNCTION public.get_teacher_dashboard_metrics(t_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH student_stats AS (
    SELECT COUNT(*) as my_students
    FROM public.teacher_student_assignments
    WHERE teacher_id = t_id
  ),
  task_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'pending') as pending,
      COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'overdue') as overdue
    FROM public.tasks
    WHERE assigned_to = t_id
  ),
  attendance_stats AS (
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'present') as present,
      COUNT(*) FILTER (WHERE status = 'absent') as absent,
      COUNT(*) FILTER (WHERE status = 'late') as late
    FROM public.attendance
    WHERE teacher_id = t_id
  ),
  group_stats AS (
    SELECT COUNT(*) as my_groups 
    FROM public.group_members 
    WHERE teacher_id = t_id
  ),
  broadcast_stats AS (
    SELECT COUNT(*) as my_broadcasts 
    FROM public.broadcast_recipients 
    WHERE teacher_id = t_id
  )
  SELECT jsonb_build_object(
    'myStudents', s.my_students,
    'myTasks', jsonb_build_object(
      'total', t.total,
      'pending', t.pending,
      'inProgress', t.in_progress,
      'completed', t.completed,
      'overdue', t.overdue,
      'completionRate', CASE WHEN t.total > 0 THEN ROUND((t.completed::numeric / t.total) * 100) ELSE 0 END
    ),
    'myGroups', g.my_groups,
    'myBroadcasts', b.my_broadcasts,
    'myAttendance', jsonb_build_object(
      'total', a.total,
      'present', a.present,
      'absent', a.absent,
      'late', a.late,
      'rate', CASE WHEN a.total > 0 THEN ROUND((a.present::numeric / a.total) * 100) ELSE 0 END
    )
  ) INTO result
  FROM student_stats s, task_stats t, attendance_stats a, group_stats g, broadcast_stats b;

  RETURN result;
END;
$$;

-- Grant EXECUTE Permissions to Authenticated Users
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_teacher_dashboard_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_growth_trend(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_task_trend(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_attendance_trend(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_trend(INT) TO authenticated;
