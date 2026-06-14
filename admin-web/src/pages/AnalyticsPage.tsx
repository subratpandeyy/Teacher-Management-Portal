import { useEffect, useState } from 'react';
import { StatsCard } from '../shared/components/StatsCard';
import { TrendingUp, Users, DollarSign, CheckSquare, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    userGrowth: 0,
    avgEngagement: 0,
    taskEfficiency: 0,
    revenueProjection: 0,
  });

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const dateStr = thirtyDaysAgo.toISOString();

        const [
          { count: newUserCount },
          { data: attendanceData },
          { data: taskData },
          { data: financeData }
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', dateStr),
          supabase.from('attendance').select('status').gte('date', dateStr.split('T')[0]),
          supabase.from('tasks').select('status').gte('created_at', dateStr),
          supabase.from('financial_records').select('amount').eq('type', 'revenue').gte('date', dateStr.split('T')[0])
        ]);

        const totalAttendance = attendanceData?.length || 0;
        const presentCount = attendanceData?.filter(a => a.status === 'present').length || 0;
        const avgEngagement = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0;

        const totalTasks = taskData?.length || 0;
        const completedTasks = taskData?.filter(t => t.status === 'completed').length || 0;
        const taskEfficiency = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const monthlyRevenue = financeData?.reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;

        setStats({
          userGrowth: newUserCount || 0,
          avgEngagement,
          taskEfficiency,
          revenueProjection: monthlyRevenue,
        });
      } catch (err) {
        console.error('Error fetching analytics:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Platform Analytics</h2>
        <p className="text-slate-500">Deep dive into platform growth and engagement (Last 30 days).</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard 
          title="User Growth" 
          value={`+${stats.userGrowth}`} 
          icon={<Users className="h-6 w-6" />} 
          description="new users this month"
        />
        <StatsCard 
          title="Avg. Engagement" 
          value={`${stats.avgEngagement}%`} 
          icon={<TrendingUp className="h-6 w-6" />} 
          description="attendance rate"
        />
        <StatsCard 
          title="Task Efficiency" 
          value={`${stats.taskEfficiency}%`} 
          icon={<CheckSquare className="h-6 w-6" />} 
          description="completion rate"
        />
        <StatsCard 
          title="Monthly Revenue" 
          value={`$${stats.revenueProjection.toLocaleString()}`} 
          icon={<DollarSign className="h-6 w-6" />} 
          description="actual revenue"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm min-h-[300px] flex items-center justify-center">
          <p className="text-slate-400">User Growth Chart (Live data ready)</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm min-h-[300px] flex items-center justify-center">
          <p className="text-slate-400">Attendance Trends Chart (Live data ready)</p>
        </div>
      </div>
    </div>
  );
}
