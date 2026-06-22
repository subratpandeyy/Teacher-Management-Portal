import { supabase } from '../../lib/supabase';

export interface UserStats {
  totalStudents: number;
  totalTeachers: number;
  totalCoordinators: number;
  totalAdmins: number;
}

export interface TaskAnalytics {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  overdue: number;
  completionRate: number;
}

export interface AttendanceAnalytics {
  total: number;
  present: number;
  absent: number;
  late: number;
  rate: number;
}

export interface DashboardStats {
  users: UserStats;
  tasks: TaskAnalytics;
  attendance: AttendanceAnalytics;
  activeGroups: number;
  totalBroadcasts: number;
  messagesToday: number;
}

export interface TeacherDashboardStats {
  myStudents: number;
  myTasks: TaskAnalytics;
  myGroups: number;
  myBroadcasts: number;
  myAttendance: AttendanceAnalytics;
}

export interface ActivityEvent {
  id: string;
  type: 'user_registered' | 'teacher_added' | 'student_added' | 'task_created'
    | 'task_completed' | 'group_created' | 'chat_sent' | 'attendance_taken'
    | 'document_uploaded' | 'assignment_created';
  description: string;
  created_at: string;
  actor_name?: string;
  metadata?: Record<string, unknown>;
}

export interface UserGrowthPoint {
  date: string;
  count: number;
}

export interface TaskTrendPoint {
  date: string;
  created: number;
  completed: number;
}

export interface AttendanceTrendPoint {
  date: string;
  present: number;
  absent: number;
  rate: number;
}

export interface MessageTrendPoint {
  date: string;
  count: number;
}

export interface ActiveGroup {
  id: string;
  name: string;
  messageCount: number;
}

export interface ActiveUser {
  id: string;
  display_name: string;
  role: string;
  messageCount: number;
}

export interface TeacherPerformance {
  id: string;
  display_name: string;
  tasksCompleted: number;
  attendanceManaged: number;
  studentsAssigned: number;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export async function getUserStats(): Promise<UserStats> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .is('deleted_at', null);

  if (error || !data) return { totalStudents: 0, totalTeachers: 0, totalCoordinators: 0, totalAdmins: 0 };

  return {
    totalStudents: data.filter(p => p.role === 'student').length,
    totalTeachers: data.filter(p => p.role === 'teacher').length,
    totalCoordinators: data.filter(p => p.role === 'coordinator').length,
    totalAdmins: data.filter(p => p.role === 'admin').length,
  };
}

export async function getTaskAnalytics(): Promise<TaskAnalytics> {
  const { data, error } = await supabase
    .from('tasks')
    .select('status');

  if (error || !data) {
    return { total: 0, pending: 0, inProgress: 0, completed: 0, overdue: 0, completionRate: 0 };
  }

  const pending = data.filter(t => t.status === 'pending').length;
  const inProgress = data.filter(t => t.status === 'in_progress').length;
  const completed = data.filter(t => t.status === 'completed').length;
  const overdue = data.filter(t => t.status === 'overdue').length;
  const total = data.length;

  return {
    total,
    pending,
    inProgress,
    completed,
    overdue,
    completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export async function getAttendanceAnalytics(): Promise<AttendanceAnalytics> {
  const { data, error } = await supabase
    .from('attendance')
    .select('status');

  if (error || !data) {
    return { total: 0, present: 0, absent: 0, late: 0, rate: 0 };
  }

  const total = data.length;
  const present = data.filter(a => a.status === 'present').length;
  const absent = data.filter(a => a.status === 'absent').length;
  const late = data.filter(a => a.status === 'late').length;

  return {
    total,
    present,
    absent,
    late,
    rate: total > 0 ? Math.round((present / total) * 100) : 0,
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [users, tasks, attendance, groupsRes, broadcastsRes, messagesRes] = await Promise.all([
    getUserStats(),
    getTaskAnalytics(),
    getAttendanceAnalytics(),
    supabase.from('groups').select('*', { count: 'exact', head: true }),
    supabase.from('broadcasts').select('*', { count: 'exact', head: true }),
    supabase.from('chat_messages').select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ]);

  return {
    users,
    tasks,
    attendance,
    activeGroups: groupsRes.count ?? 0,
    totalBroadcasts: broadcastsRes.count ?? 0,
    messagesToday: messagesRes.count ?? 0,
  };
}

export async function getTeacherDashboardStats(teacherId: string): Promise<TeacherDashboardStats> {
  const [studentsRes, tasksData, groupsRes, broadcastsRes, attendanceData] = await Promise.all([
    supabase.from('teacher_student_assignments').select('student_id', { count: 'exact', head: true }).eq('teacher_id', teacherId),
    supabase.from('tasks').select('status').eq('assigned_to', teacherId),
    supabase.from('group_members').select('group_id', { count: 'exact', head: true }).eq('teacher_id', teacherId),
    supabase.from('broadcast_recipients').select('broadcast_id', { count: 'exact', head: true }).eq('teacher_id', teacherId),
    supabase.from('attendance').select('status').eq('teacher_id', teacherId),
  ]);

  const tasks = tasksData.data ?? [];
  const pending = tasks.filter(t => t.status === 'pending').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const overdue = tasks.filter(t => t.status === 'overdue').length;
  const totalTasks = tasks.length;

  const taskAnalytics: TaskAnalytics = {
    total: totalTasks,
    pending,
    inProgress,
    completed,
    overdue,
    completionRate: totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0,
  };

  const attendance = attendanceData.data ?? [];
  const totalAttendance = attendance.length;
  const present = attendance.filter(a => a.status === 'present').length;
  const absent = attendance.filter(a => a.status === 'absent').length;
  const late = attendance.filter(a => a.status === 'late').length;

  const attendanceAnalytics: AttendanceAnalytics = {
    total: totalAttendance,
    present,
    absent,
    late,
    rate: totalAttendance > 0 ? Math.round((present / totalAttendance) * 100) : 0,
  };

  return {
    myStudents: studentsRes.count ?? 0,
    myTasks: taskAnalytics,
    myGroups: groupsRes.count ?? 0,
    myBroadcasts: broadcastsRes.count ?? 0,
    myAttendance: attendanceAnalytics,
  };
}

export async function getRecentActivity(limit = 20): Promise<ActivityEvent[]> {
  const activities: ActivityEvent[] = [];

  // Recent registrations
  const { data: newProfiles } = await supabase
    .from('profiles')
    .select('id, display_name, role, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (newProfiles) {
    newProfiles.forEach(p => {
      const type = p.role === 'teacher' ? 'teacher_added'
        : p.role === 'student' ? 'student_added'
        : 'user_registered';
      activities.push({
        id: `profile-${p.id}`,
        type,
        description: `${p.display_name ?? 'A user'} registered as ${p.role}`,
        created_at: p.created_at,
        actor_name: p.display_name ?? undefined,
        metadata: { role: p.role },
      });
    });
  }

  // Recent tasks
  const { data: recentTasks } = await supabase
    .from('tasks')
    .select('id, title, status, created_at, assigned_by, assigned_to')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (recentTasks) {
    recentTasks.forEach(t => {
      const type = t.status === 'completed' ? 'task_completed' as const : 'task_created' as const;
      activities.push({
        id: `task-${t.id}-${t.status}`,
        type,
        description: type === 'task_completed'
          ? `Task "${t.title}" completed`
          : `Task "${t.title}" created`,
        created_at: t.created_at,
      });
    });
  }

  // Recent groups
  const { data: recentGroups } = await supabase
    .from('groups')
    .select('id, name, created_at, created_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (recentGroups) {
    recentGroups.forEach(g => {
      activities.push({
        id: `group-${g.id}`,
        type: 'group_created',
        description: `Group "${g.name}" created`,
        created_at: g.created_at,
      });
    });
  }

  // Recent attendance
  const { data: recentAttendance } = await supabase
    .from('attendance')
    .select('id, created_at, status, student_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (recentAttendance) {
    recentAttendance.forEach(a => {
      activities.push({
        id: `attendance-${a.id}`,
        type: 'attendance_taken',
        description: `Attendance marked as ${a.status}`,
        created_at: a.created_at,
      });
    });
  }

  // Recent documents
  const { data: recentDocs } = await supabase
    .from('documents')
    .select('id, title, created_at, uploaded_by')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (recentDocs) {
    recentDocs.forEach(d => {
      activities.push({
        id: `doc-${d.id}`,
        type: 'document_uploaded',
        description: `Document "${d.title}" uploaded`,
        created_at: d.created_at,
      });
    });
  }

  // Recent chat messages (limited)
  const { data: recentMessages } = await supabase
    .from('chat_messages')
    .select('id, created_at, body, sender_id')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (recentMessages) {
    recentMessages.forEach(m => {
      activities.push({
        id: `chat-${m.id}`,
        type: 'chat_sent',
        description: m.body
          ? `Message: ${m.body.substring(0, 60)}${m.body.length > 60 ? '...' : ''}`
          : 'A message was sent',
        created_at: m.created_at,
      });
    });
  }

  // Sort all by created_at descending, take top N
  activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return activities.slice(0, limit);
}

export async function getUserGrowthTrend(days = 30): Promise<UserGrowthPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString();

  const { data } = await supabase
    .from('profiles')
    .select('created_at')
    .gte('created_at', startStr)
    .is('deleted_at', null)
    .order('created_at');

  if (!data) return [];

  const map = new Map<string, number>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    map.set(d.toISOString().split('T')[0], 0);
  }

  let running = 0;
  data.forEach(p => {
    running++;
    const day = p.created_at.split('T')[0];
    if (map.has(day)) map.set(day, running);
  });

  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

export async function getTaskTrend(days = 30): Promise<TaskTrendPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString();

  const [created, completed] = await Promise.all([
    supabase.from('tasks').select('created_at').gte('created_at', startStr).order('created_at'),
    supabase.from('tasks').select('updated_at').eq('status', 'completed').gte('updated_at', startStr).order('updated_at'),
  ]);

  const createdMap = new Map<string, number>();
  const completedMap = new Map<string, number>();

  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().split('T')[0];
    createdMap.set(key, 0);
    completedMap.set(key, 0);
  }

  created.data?.forEach(t => {
    const day = t.created_at.split('T')[0];
    if (createdMap.has(day)) createdMap.set(day, (createdMap.get(day) ?? 0) + 1);
  });

  completed.data?.forEach(t => {
    const day = t.updated_at.split('T')[0];
    if (completedMap.has(day)) completedMap.set(day, (completedMap.get(day) ?? 0) + 1);
  });

  return Array.from(createdMap.entries()).map(([date, createdCount]) => ({
    date,
    created: createdCount,
    completed: completedMap.get(date) ?? 0,
  }));
}

export async function getAttendanceTrend(days = 30): Promise<AttendanceTrendPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString().split('T')[0];

  const { data } = await supabase
    .from('attendance')
    .select('date, status')
    .gte('date', startStr)
    .order('date');

  if (!data) return [];

  const dayMap = new Map<string, { present: number; absent: number; total: number }>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dayMap.set(d.toISOString().split('T')[0], { present: 0, absent: 0, total: 0 });
  }

  data.forEach(a => {
    const entry = dayMap.get(a.date);
    if (entry) {
      entry.total++;
      if (a.status === 'present') entry.present++;
      else entry.absent++;
    }
  });

  return Array.from(dayMap.entries()).map(([date, val]) => ({
    date,
    present: val.present,
    absent: val.absent,
    rate: val.total > 0 ? Math.round((val.present / val.total) * 100) : 0,
  }));
}

export async function getMessageTrend(days = 30): Promise<MessageTrendPoint[]> {
  const start = new Date();
  start.setDate(start.getDate() - days);
  const startStr = start.toISOString();

  const { data } = await supabase
    .from('chat_messages')
    .select('created_at')
    .gte('created_at', startStr)
    .order('created_at');

  if (!data) return [];

  const map = new Map<string, number>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    map.set(d.toISOString().split('T')[0], 0);
  }

  data.forEach(m => {
    const day = m.created_at.split('T')[0];
    if (map.has(day)) map.set(day, (map.get(day) ?? 0) + 1);
  });

  return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
}

export async function getMostActiveGroups(limit = 5): Promise<ActiveGroup[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('conversation_id');

  if (!data) return [];

  const msgCount = new Map<string, number>();
  data.forEach(m => {
    msgCount.set(m.conversation_id, (msgCount.get(m.conversation_id) ?? 0) + 1);
  });

  const top = Array.from(msgCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const groupIds = top.map(([id]) => id);
  const { data: conversations } = await supabase
    .from('conversations')
    .select('id, teacher_id')
    .in('id', groupIds);

  const convMap = new Map(conversations?.map(c => [c.id, c.teacher_id]) ?? []);

  return top.map(([id, count]) => ({
    id,
    name: convMap.get(id) ? `Conversation ${id.substring(0, 8)}` : 'Unknown',
    messageCount: count,
  }));
}

export async function getMostActiveUsers(limit = 5): Promise<ActiveUser[]> {
  const { data } = await supabase
    .from('chat_messages')
    .select('sender_id');

  if (!data) return [];

  const msgCount = new Map<string, number>();
  data.forEach(m => {
    msgCount.set(m.sender_id, (msgCount.get(m.sender_id) ?? 0) + 1);
  });

  const top = Array.from(msgCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const userIds = top.map(([id]) => id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, role')
    .in('id', userIds);

  const profileMap = new Map(profiles?.map(p => [p.id, p]) ?? []);

  return top.map(([id, count]) => {
    const p = profileMap.get(id);
    return {
      id,
      display_name: p?.display_name ?? 'Unknown',
      role: p?.role ?? 'unknown',
      messageCount: count,
    };
  });
}

export async function getTeacherPerformance(limit = 10): Promise<TeacherPerformance[]> {
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('role', 'teacher')
    .is('deleted_at', null)
    .limit(limit);

  if (!teachers) return [];

  const teacherIds = teachers.map(t => t.id);

  const [tasksData, attendanceData, assignmentData] = await Promise.all([
    supabase.from('tasks').select('assigned_to').eq('status', 'completed').in('assigned_to', teacherIds),
    supabase.from('attendance').select('teacher_id').in('teacher_id', teacherIds),
    supabase.from('teacher_student_assignments').select('teacher_id').in('teacher_id', teacherIds),
  ]);

  const taskCount = new Map<string, number>();
  tasksData.data?.forEach(t => taskCount.set(t.assigned_to, (taskCount.get(t.assigned_to) ?? 0) + 1));

  const attendanceCount = new Map<string, number>();
  attendanceData.data?.forEach(a => attendanceCount.set(a.teacher_id, (attendanceCount.get(a.teacher_id) ?? 0) + 1));

  const studentCount = new Map<string, number>();
  assignmentData.data?.forEach(a => studentCount.set(a.teacher_id, (studentCount.get(a.teacher_id) ?? 0) + 1));

  return teachers.map(t => ({
    id: t.id,
    display_name: t.display_name ?? 'Unknown',
    tasksCompleted: taskCount.get(t.id) ?? 0,
    attendanceManaged: attendanceCount.get(t.id) ?? 0,
    studentsAssigned: studentCount.get(t.id) ?? 0,
  }));
}

export { relativeTime };
