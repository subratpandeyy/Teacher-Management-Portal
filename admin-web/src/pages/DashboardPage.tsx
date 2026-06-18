import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users,
  UserCheck,
  GraduationCap,
  UsersRound,
  ClipboardCheck,
  CheckSquare,
  Megaphone,
  Loader2,
  MessageSquare,
  UserPlus,
  BookOpen,
  CalendarCheck,
  Activity,
  Hash,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { StatsCard } from '../shared/components/StatsCard';
import { useAuth } from '../core/auth/AuthContext';
import { getDashboardStats, getRecentActivity, relativeTime, type ActivityEvent, type DashboardStats } from '../core/services/analyticsService';

const ACTIVITY_ICONS: Record<ActivityEvent['type'], LucideIcon> = {
  user_registered: UserPlus,
  teacher_added: GraduationCap,
  student_added: UsersRound,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  group_created: Users,
  chat_sent: MessageSquare,
  attendance_taken: ClipboardCheck,
  document_uploaded: BookOpen,
  assignment_created: CalendarCheck,
};

const ACTIVITY_COLORS: Record<ActivityEvent['type'], string> = {
  user_registered: 'bg-blue-50 text-blue-600',
  teacher_added: 'bg-emerald-50 text-emerald-600',
  student_added: 'bg-purple-50 text-purple-600',
  task_created: 'bg-amber-50 text-amber-600',
  task_completed: 'bg-green-50 text-blue-600',
  group_created: 'bg-rose-50 text-rose-600',
  chat_sent: 'bg-cyan-50 text-cyan-600',
  attendance_taken: 'bg-indigo-50 text-indigo-600',
  document_uploaded: 'bg-orange-50 text-orange-600',
  assignment_created: 'bg-teal-50 text-teal-600',
};

export function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);

  const fetchData = useCallback(async () => {
    if (!profile || authLoading) return;
    setLoading(true);
    try {
      const [s, a] = await Promise.all([
        getDashboardStats(),
        getRecentActivity(15),
      ]);
      setStats(s);
      setActivities(a);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [profile, authLoading]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const isAdmin = profile?.role === 'admin';

  if (loading || authLoading || !stats) {
    return (
      <div className="loading-page min-h-[60vh]">
        <Loader2 className="spinner" aria-label="Loading dashboard" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">
          Welcome back, {profile?.display_name ?? 'User'}
        </h1>
        <p className="page-subtitle">
          {isAdmin && 'Platform overview and key metrics at a glance.'}
          {profile?.role === 'coordinator' && 'Manage your cohort and track progress.'}
          {profile?.role === 'teacher' && 'Your classes, materials, and tasks.'}
          {profile?.role === 'student' && 'Track your learning journey and pending tasks.'}
        </p>
      </div>

      <div className="space-y-8">
        <section aria-label="Key metrics">
          <div className="kpi-grid">
            <StatsCard
              title="Total Users"
              value={stats.users.totalStudents + stats.users.totalTeachers + stats.users.totalCoordinators + stats.users.totalAdmins}
              icon={<UsersRound className="h-5 w-5" />}
              description="All registered users"
            />
            <StatsCard
              title="Total Teachers"
              value={stats.users.totalTeachers}
              icon={<GraduationCap className="h-5 w-5" />}
              description="Active faculty"
            />
            <StatsCard
              title="Total Students"
              value={stats.users.totalStudents}
              icon={<Users className="h-5 w-5" />}
              description="Enrolled students"
            />
            <StatsCard
              title="Active Groups"
              value={stats.activeGroups}
              icon={<UsersRound className="h-5 w-5" />}
              description="Groups created"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="kpi-grid">
              <StatsCard
                title="Active Tasks"
                value={stats.tasks.pending + stats.tasks.inProgress + stats.tasks.overdue}
                icon={<CheckSquare className="h-5 w-5" />}
                description={`${stats.tasks.completed} completed of ${stats.tasks.total}`}
              />
              <StatsCard
                title="Task Completion Rate"
                value={`${stats.tasks.completionRate}%`}
                icon={<ArrowUpRight className="h-5 w-5" />}
                description={`${stats.tasks.completed}/${stats.tasks.total} tasks`}
              />
              <StatsCard
                title="Attendance Rate"
                value={`${stats.attendance.rate}%`}
                icon={<ClipboardCheck className="h-5 w-5" />}
                description={`${stats.attendance.present} present of ${stats.attendance.total}`}
              />
              {isAdmin && (
                <StatsCard
                  title="Messages Today"
                  value={stats.messagesToday}
                  icon={<MessageSquare className="h-5 w-5" />}
                  description="Chat messages sent today"
                />
              )}
              {isAdmin && (
                <StatsCard
                  title="Broadcasts"
                  value={stats.totalBroadcasts}
                  icon={<Megaphone className="h-5 w-5" />}
                  description="Total broadcasts"
                />
              )}
              <StatsCard
                title="Total Coordinators"
                value={stats.users.totalCoordinators}
                icon={<UserCheck className="h-5 w-5" />}
              />
            </div>
          </div>

          <aside className="lg:col-span-1" aria-label="Activity feed">
            <div className="card">
              <div className="card-header">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  Recent Activity
                </h2>
              </div>
              <div className="card-body max-h-[500px] overflow-y-auto">
                {activities.length === 0 ? (
                  <div className="empty-state py-8">
                    <Activity className="empty-state-icon" />
                    <p className="empty-state-desc">No recent activity yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activities.map((event) => {
                      const Icon = ACTIVITY_ICONS[event.type];
                      return (
                        <div key={event.id} className="flex items-start gap-3">
                          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${ACTIVITY_COLORS[event.type]}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-700 leading-snug">
                              {event.description}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">
                              <Hash className="h-3 w-3 inline mr-0.5" />
                              {event.type.replace(/_/g, ' ')} · {relativeTime(event.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
