import { useEffect, useState, useMemo } from 'react';
import { 
  Users, 
  UserCheck, 
  GraduationCap, 
  UsersRound, 
  ClipboardCheck, 
  CheckSquare, 
  DollarSign, 
  Megaphone,
  BookOpen,
  Calendar,
  TrendingUp,
  Loader2
} from 'lucide-react';
import { StatsCard } from '../shared/components/StatsCard';
import { useAuth } from '../core/auth/AuthContext';
import { supabase } from '../lib/supabase';
import { DailyReportForm } from '../features/coordinators/DailyReportForm';

export function DashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    totalCoordinators: 0,
    activeGroups: 0,
    attendanceRate: 0,
    taskCompletion: 0,
    revenue: 0,
    broadcasts: 0,
    materialsUploaded: 0,
    upcomingClasses: 0,
    overallProgress: 0,
    pendingTasks: 0,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      setLoading(false);
      return;
    }

    async function fetchStats() {
      setLoading(true);
      try {
        const queries: any[] = [
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'coordinator'),
          supabase.from('groups').select('*', { count: 'exact', head: true }),
          supabase.from('broadcasts').select('*', { count: 'exact', head: true }),
        ];

        // Role-specific data filtering
        if (profile?.role === 'admin') {
          queries.push(supabase.from('attendance').select('status'));
          queries.push(supabase.from('tasks').select('status'));
          queries.push(supabase.from('financial_records').select('amount').eq('type', 'revenue'));
        } else if (profile?.role === 'coordinator') {
          // Get student IDs first for attendance
          const { data: assignments } = await supabase
            .from('coordinator_assignments')
            .select('student_id')
            .eq('coordinator_id', profile.id);
          
          const studentIds = assignments?.map(a => a.student_id).filter(Boolean) || [];
          
          if (studentIds.length > 0) {
            queries.push(supabase.from('attendance').select('status').in('student_id', studentIds));
          } else {
            queries.push({ data: [] });
          }
          queries.push(supabase.from('tasks').select('status').eq('assigned_by', profile.id));
          queries.push({ data: [] }); // Dummy for finance
        } else if (profile?.role === 'teacher') {
          // Get students assigned to this teacher
          const { data: assignments } = await supabase
            .from('coordinator_assignments')
            .select('student_id')
            .eq('teacher_id', profile.id);
          
          const studentIds = assignments?.map(a => a.student_id).filter(Boolean) || [];

          if (studentIds.length > 0) {
            queries.push(supabase.from('attendance').select('status').in('student_id', studentIds));
          } else {
            queries.push({ data: [] });
          }
          queries.push(supabase.from('tasks').select('status').eq('assigned_to', profile.id));
          queries.push({ data: [] }); // Dummy for finance
        } else {
          queries.push(supabase.from('attendance').select('status').eq('student_id', profile?.id));
          queries.push(supabase.from('tasks').select('status').eq('assigned_to', profile?.id));
          queries.push({ data: [] }); // Dummy for finance
        }

        const results = await Promise.all(queries);
        const [students, teachers, coordinators, groups, broadcasts, attendanceData, taskData, financeData] = results;

        const totalAttendance = attendanceData?.data?.length || 0;
        const presentCount = attendanceData?.data?.filter((a: any) => a.status === 'present').length || 0;
        const attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

        const totalTasks = taskData?.data?.length || 0;
        const completedTasks = taskData?.data?.filter((t: any) => t.status === 'completed').length || 0;
        const pendingTasks = taskData?.data?.filter((t: any) => t.status === 'pending' || t.status === 'in_progress').length || 0;
        const taskCompletion = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const totalRevenue = financeData?.data ? financeData.data.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0) : 0;

        // Fetch additional stats for teachers and students
        let materialsUploaded = 0;
        let upcomingClasses = 0;
        let overallProgress = 0;

        if (profile?.role === 'teacher') {
          const { count } = await supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('uploaded_by', profile.id);
          materialsUploaded = count || 0;
        }

        if (profile?.role === 'student') {
          const { data: progress } = await supabase
            .from('student_progress')
            .select('completion_percentage')
            .eq('student_id', profile.id);
          
          if (progress?.length) {
            overallProgress = Math.round(progress.reduce((acc, curr) => acc + curr.completion_percentage, 0) / progress.length);
          }
        }

        setStats({
          totalStudents: students.count || 0,
          totalTeachers: teachers.count || 0,
          totalCoordinators: coordinators.count || 0,
          activeGroups: groups.count || 0,
          broadcasts: broadcasts.count || 0,
          attendanceRate,
          taskCompletion,
          revenue: totalRevenue,
          materialsUploaded,
          upcomingClasses,
          overallProgress,
          pendingTasks,
        });
      } catch (err) {
        console.error('Error fetching dashboard stats:', err);
      } finally {
        setLoading(false);
      }
    }

    void fetchStats();
  }, [profile, authLoading]);

  const isCoordinator = profile?.role === 'coordinator';
  const isTeacher = profile?.role === 'teacher';
  const isStudent = profile?.role === 'student';
  const isAdmin = profile?.role === 'admin';

  if (loading || authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome back, {profile?.display_name}</h2>
        <p className="text-slate-500">Here's what's happening with your platform today.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard 
          title="Total Students" 
          value={stats.totalStudents} 
          icon={<UsersRound className="h-6 w-6" />} 
          description="Registered Students"
        />
        <StatsCard 
          title="Total Teachers" 
          value={stats.totalTeachers} 
          icon={<GraduationCap className="h-6 w-6" />} 
          description="Active Faculty"
        />
        <StatsCard 
          title="Total Coordinators" 
          value={stats.totalCoordinators} 
          icon={<UserCheck className="h-6 w-6" />} 
        />
        <StatsCard 
          title="Active Groups" 
          value={stats.activeGroups} 
          icon={<Users className="h-6 w-6" />} 
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <StatsCard 
              title="Attendance Rate" 
              value={`${stats.attendanceRate}%`} 
              icon={<ClipboardCheck className="h-6 w-6" />} 
              description="Overall percentage"
            />
            <StatsCard 
              title="Task Completion" 
              value={`${stats.taskCompletion}%`} 
              icon={<CheckSquare className="h-6 w-6" />} 
            />
            
            {isTeacher && (
              <StatsCard 
                title="Materials Uploaded" 
                value={stats.materialsUploaded} 
                icon={<BookOpen className="h-6 w-6" />} 
              />
            )}
            
            {isTeacher && (
              <StatsCard 
                title="Upcoming Classes" 
                value={stats.upcomingClasses} 
                icon={<Calendar className="h-6 w-6" />} 
              />
            )}

            {isStudent && (
              <StatsCard 
                title="Overall Progress" 
                value={`${stats.overallProgress}%`} 
                icon={<TrendingUp className="h-6 w-6" />} 
                description="Subject completion"
              />
            )}

            {isStudent && (
              <StatsCard 
                title="Pending Tasks" 
                value={stats.pendingTasks} 
                icon={<BookOpen className="h-6 w-6" />} 
              />
            )}

            {isAdmin && (
              <StatsCard 
                title="Revenue" 
                value={`$${stats.revenue.toLocaleString()}`} 
                icon={<DollarSign className="h-6 w-6" />} 
                description="Total earnings"
              />
            )}
            
            {!isTeacher && !isStudent && (
              <StatsCard 
                title="Broadcasts" 
                value={stats.broadcasts} 
                icon={<Megaphone className="h-6 w-6" />} 
              />
            )}
          </div>
          
          {isCoordinator && <DailyReportForm />}
        </div>

        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Recent Activity</h3>
          <div className="mt-6 space-y-6">
            {/* Activity list placeholder */}
            <div className="flex h-[300px] flex-col items-center justify-center text-center">
              <Loader2 className="mb-2 h-6 w-6 animate-spin text-slate-300" />
              <p className="text-sm text-slate-400">Activity feed coming soon...</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
