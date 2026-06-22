import { useEffect, useState } from 'react';
import { Users, GraduationCap, UsersRound } from 'lucide-react';
import { useAuth } from '../core/auth/AuthContext';
import {
  getDashboardStats, getRecentActivity, getUserGrowthTrend,
  getTaskTrend, getAttendanceTrend, getMessageTrend,
  getTeacherDashboardStats,
  type ActivityEvent, type DashboardStats, type TeacherDashboardStats,
  type UserGrowthPoint, type TaskTrendPoint,
  type AttendanceTrendPoint, type MessageTrendPoint,
} from '../core/services/analyticsService';
import { StatCard } from '../features/dashboard/StatCard';
import { StudentGrowthChart, TeacherActivityChart, AttendanceTrendGraph, GroupCreationTrend } from '../features/dashboard/AnalyticsCharts';
import { ActivityFeed } from '../features/dashboard/ActivityFeed';
import { QuickActions } from '../features/dashboard/QuickActions';
import { PerformanceCards } from '../features/dashboard/PerformanceCards';
import { Widgets } from '../features/dashboard/Widgets';
import { DashboardSkeleton } from '../features/dashboard/DashboardSkeleton';

export function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [teacherStats, setTeacherStats] = useState<TeacherDashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [studentGrowth, setStudentGrowth] = useState<UserGrowthPoint[]>([]);
  const [taskTrend, setTaskTrend] = useState<TaskTrendPoint[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendPoint[]>([]);
  const [messageTrend, setMessageTrend] = useState<MessageTrendPoint[]>([]);

  useEffect(() => {
    if (!profile || authLoading) return;
    let cancelled = false;

    if (profile.role === 'teacher') {
      Promise.all([
        getTeacherDashboardStats(profile.id),
        getRecentActivity(15),
      ]).then(([ts, a]) => {
        if (!cancelled) {
          setTeacherStats(ts);
          setActivities(a);
        }
      }).catch((err) => {
        console.error('Error fetching teacher dashboard data:', err);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    } else {
      Promise.all([
        getDashboardStats(),
        getRecentActivity(15),
        getUserGrowthTrend(30),
        getTaskTrend(30),
        getAttendanceTrend(30),
        getMessageTrend(30),
      ]).then(([s, a, growth, tasks, attendance, messages]) => {
        if (!cancelled) {
          setStats(s);
          setActivities(a);
          setStudentGrowth(growth);
          setTaskTrend(tasks);
          setAttendanceTrend(attendance);
          setMessageTrend(messages);
        }
      }).catch((err) => {
        console.error('Error fetching dashboard data:', err);
      }).finally(() => {
        if (!cancelled) setLoading(false);
      });
    }
    return () => { cancelled = true; };
  }, [profile, authLoading]);

  if (loading || authLoading || (profile?.role === 'teacher' ? !teacherStats : !stats)) {
    return (
      <div className="min-h-[60vh]">
        <DashboardSkeleton />
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';
  const totalUsers = stats ? (stats.users.totalStudents + stats.users.totalTeachers + stats.users.totalCoordinators + stats.users.totalAdmins) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Welcome back, {profile?.display_name ?? 'User'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin && 'Platform overview and key metrics at a glance.'}
          {profile?.role === 'coordinator' && 'Manage your cohort and track progress.'}
          {profile?.role === 'teacher' && 'Your classes, materials, and tasks.'}
          {profile?.role === 'student' && 'Track your learning journey and pending tasks.'}
        </p>
      </div>

      <section aria-label="Key metrics">
        {profile?.role === 'teacher' && teacherStats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="My Students"
              value={teacherStats.myStudents}
              icon={<Users className="h-5 w-5" />}
              iconColor="blue"
              description="Assigned to me"
              delay={0}
            />
            <StatCard
              title="My Tasks"
              value={teacherStats.myTasks.total}
              icon={<GraduationCap className="h-5 w-5" />}
              iconColor="emerald"
              description="Total tasks assigned to me"
              delay={0.05}
            />
            <StatCard
              title="My Groups"
              value={teacherStats.myGroups}
              icon={<UsersRound className="h-5 w-5" />}
              iconColor="purple"
              description="Groups I am in"
              delay={0.1}
            />
            <StatCard
              title="Broadcasts"
              value={teacherStats.myBroadcasts}
              icon={<UsersRound className="h-5 w-5" />}
              iconColor="amber"
              description="Messages received"
              delay={0.15}
            />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Users"
              value={totalUsers}
              icon={<UsersRound className="h-5 w-5" />}
              iconColor="blue"
              description="All registered users"
              delay={0}
            />
            <StatCard
              title="Total Teachers"
              value={stats.users.totalTeachers}
              icon={<GraduationCap className="h-5 w-5" />}
              iconColor="emerald"
              description="Active faculty"
              delay={0.05}
            />
            <StatCard
              title="Total Students"
              value={stats.users.totalStudents}
              icon={<Users className="h-5 w-5" />}
              iconColor="purple"
              description="Enrolled students"
              delay={0.1}
            />
            <StatCard
              title="Active Groups"
              value={stats.activeGroups}
              icon={<UsersRound className="h-5 w-5" />}
              iconColor="amber"
              description="Groups created"
              delay={0.15}
            />
          </div>
        ) : null}
      </section>

      {stats && <PerformanceCards stats={stats} />}

      {/* <section aria-label="Analytics">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <StudentGrowthChart data={studentGrowth} />
          <TeacherActivityChart data={taskTrend} />
          <AttendanceTrendGraph data={attendanceTrend} />
          <GroupCreationTrend data={messageTrend} />
        </div>
      </section> */}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-3">
          <QuickActions />
          {stats && (
            <Widgets
              totalUsers={totalUsers}
              totalTeachers={stats.users.totalTeachers}
              totalCoordinators={stats.users.totalCoordinators}
              totalStudents={stats.users.totalStudents}
            />
          )}
        </div>
        {profile?.role !== 'teacher' && (
          <div className="lg:col-span-1">
            <ActivityFeed activities={activities} />
          </div>
        )}
      </div>
    </div>
  );
}
