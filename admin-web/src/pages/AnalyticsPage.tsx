import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Users, CheckSquare, Loader2, BarChart3, Activity,
  MessageSquare, Calendar, UserCheck, Hash, ArrowUpRight,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { StatsCard } from '../shared/components/StatsCard';
import { useAuth } from '../core/auth/AuthContext';
import {
  getTaskAnalytics, getUserGrowthTrend, getTaskTrend,
  getAttendanceTrend, getMessageTrend, getMostActiveGroups,
  getMostActiveUsers, getTeacherPerformance, getUserStats,
  getAttendanceAnalytics,
  type UserGrowthPoint, type TaskTrendPoint,
  type AttendanceTrendPoint, type MessageTrendPoint,
  type ActiveGroup, type ActiveUser, type TeacherPerformance,
  type TaskAnalytics, type AttendanceAnalytics, type UserStats,
} from '../core/services/analyticsService';

type Period = 7 | 30 | 90;

const PIE_COLORS = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6'];
const CHART_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6'];

function FilterBar({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
      {([7, 30, 90] as Period[]).map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {p === 7 ? 'Week' : p === 30 ? 'Month' : 'Quarter'}
        </button>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(30);

  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [taskStats, setTaskStats] = useState<TaskAnalytics | null>(null);
  const [attendanceStats, setAttendanceStats] = useState<AttendanceAnalytics | null>(null);

  const [userGrowth, setUserGrowth] = useState<UserGrowthPoint[]>([]);
  const [taskTrend, setTaskTrend] = useState<TaskTrendPoint[]>([]);
  const [attendanceTrend, setAttendanceTrend] = useState<AttendanceTrendPoint[]>([]);
  const [messageTrend, setMessageTrend] = useState<MessageTrendPoint[]>([]);
  const [activeGroups, setActiveGroups] = useState<ActiveGroup[]>([]);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [teacherPerformance, setTeacherPerformance] = useState<TeacherPerformance[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [us, ts, ats, ug, tt, at, mt, ag, au, tp] = await Promise.all([
        getUserStats(),
        getTaskAnalytics(),
        getAttendanceAnalytics(),
        getUserGrowthTrend(period),
        getTaskTrend(period),
        getAttendanceTrend(period),
        getMessageTrend(period),
        getMostActiveGroups(5),
        getMostActiveUsers(5),
        getTeacherPerformance(10),
      ]);
      setUserStats(us);
      setTaskStats(ts);
      setAttendanceStats(ats);
      setUserGrowth(ug);
      setTaskTrend(tt);
      setAttendanceTrend(at);
      setMessageTrend(mt);
      setActiveGroups(ag);
      setActiveUsers(au);
      setTeacherPerformance(tp);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const taskPieData = useMemo(() => {
    if (!taskStats) return [];
    return [
      { name: 'Pending', value: taskStats.pending },
      { name: 'In Progress', value: taskStats.inProgress },
      { name: 'Completed', value: taskStats.completed },
      { name: 'Overdue', value: taskStats.overdue },
    ].filter(d => d.value > 0);
  }, [taskStats]);

  const attendancePieData = useMemo(() => {
    if (!attendanceStats) return [];
    return [
      { name: 'Present', value: attendanceStats.present },
      { name: 'Absent', value: attendanceStats.absent },
      { name: 'Late', value: attendanceStats.late },
    ].filter(d => d.value > 0);
  }, [attendanceStats]);

  if (loading) {
    return (
      <div className="loading-page min-h-[400px]">
        <div className="spinner" aria-label="Loading analytics" />
      </div>
    );
  }

  return (
    <div className="page-container space-y-8">
      <div className="page-header">
        <h1 className="page-title">Platform Analytics</h1>
        <p className="page-subtitle">Deep dive into platform growth and engagement.</p>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid" aria-label="Key performance indicators">
        <StatsCard
          title="Total Users"
          value={(userStats?.totalStudents ?? 0) + (userStats?.totalTeachers ?? 0) + (userStats?.totalCoordinators ?? 0) + (userStats?.totalAdmins ?? 0)}
          icon={<Users className="h-6 w-6" />}
          description="All registered users"
        />
        <StatsCard
          title="Task Completion Rate"
          value={`${taskStats?.completionRate ?? 0}%`}
          icon={<CheckSquare className="h-6 w-6" />}
          description={`${taskStats?.completed ?? 0}/${taskStats?.total ?? 0} tasks`}
        />
        <StatsCard
          title="Attendance Rate"
          value={`${attendanceStats?.rate ?? 0}%`}
          icon={<Activity className="h-6 w-6" />}
          description={`${attendanceStats?.present ?? 0} present of ${attendanceStats?.total ?? 0}`}
        />
        <StatsCard
          title="Active Tasks"
          value={(taskStats?.pending ?? 0) + (taskStats?.inProgress ?? 0) + (taskStats?.overdue ?? 0)}
          icon={<BarChart3 className="h-6 w-6" />}
          description="Non-completed tasks"
        />
      </div>

      {/* A. User Growth Trend */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            User Growth Trend
          </h2>
          <FilterBar value={period} onChange={setPeriod} />
        </div>
        <div className="card-body">
          {userGrowth.length === 0 ? (
            <div className="empty-state py-12">
              <BarChart3 className="empty-state-icon" />
              <p className="empty-state-desc">No user data for this period.</p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} dot={false} name="Total Users" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* B. Task Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-amber-600" />
              Tasks Created vs Completed
            </h2>
          </div>
          <div className="card-body">
            {taskTrend.length === 0 ? (
              <div className="empty-state py-12">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No task data for this period.</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="created" fill="#F59E0B" name="Created" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="completed" fill="#10B981" name="Completed" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Hash className="h-5 w-5 text-purple-600" />
              Task Status Distribution
            </h2>
          </div>
          <div className="card-body">
            {taskPieData.length === 0 ? (
              <div className="empty-state py-12">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No tasks created yet.</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={taskPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {taskPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* C. Attendance Analytics */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-600" />
              Attendance Rate Trend
            </h2>
          </div>
          <div className="card-body">
            {attendanceTrend.length === 0 ? (
              <div className="empty-state py-12">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No attendance data for this period.</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={attendanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Line type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={2} dot={false} name="Attendance Rate" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Activity className="h-5 w-5 text-indigo-600" />
              Present vs Absent
            </h2>
          </div>
          <div className="card-body">
            {attendancePieData.length === 0 ? (
              <div className="empty-state py-12">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No attendance records yet.</p>
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={attendancePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {attendancePieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E. Communication Analytics */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-cyan-600" />
            Messages Sent Per Day
          </h2>
          <FilterBar value={period} onChange={setPeriod} />
        </div>
        <div className="card-body">
          {messageTrend.length === 0 ? (
            <div className="empty-state py-12">
              <BarChart3 className="empty-state-icon" />
              <p className="empty-state-desc">No messages sent in this period.</p>
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={messageTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#06B6D4" name="Messages" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Active Groups & Active Users */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-5 w-5 text-rose-600" />
              Most Active Conversations
            </h2>
          </div>
          <div className="card-body">
            {activeGroups.length === 0 ? (
              <div className="empty-state py-8">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No conversation data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeGroups.map((g, i) => (
                  <div key={g.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                      <span className="text-sm text-slate-700 truncate">{g.name}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{g.messageCount} msgs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Most Active Users
            </h2>
          </div>
          <div className="card-body">
            {activeUsers.length === 0 ? (
              <div className="empty-state py-8">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No user activity data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeUsers.map((u, i) => (
                  <div key={u.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-400 w-5">{i + 1}.</span>
                      <span className="text-sm text-slate-700 truncate">{u.display_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase">{u.role}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-900">{u.messageCount} msgs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* F. Teacher Performance Analytics */}
      {profile?.role === 'admin' && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-600" />
              Teacher Performance
            </h2>
          </div>
          <div className="card-body">
            {teacherPerformance.length === 0 ? (
              <div className="empty-state py-8">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No teacher data available.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="text-left py-2 px-3 font-semibold text-slate-600">Teacher</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Tasks Completed</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Attendance Managed</th>
                      <th className="text-right py-2 px-3 font-semibold text-slate-600">Students Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teacherPerformance.map(t => (
                      <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-900">{t.display_name}</td>
                        <td className="text-right py-2 px-3 text-slate-700">{t.tasksCompleted}</td>
                        <td className="text-right py-2 px-3 text-slate-700">{t.attendanceManaged}</td>
                        <td className="text-right py-2 px-3 text-slate-700">{t.studentsAssigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
