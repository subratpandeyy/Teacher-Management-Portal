import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TrendingUp, Users, CheckSquare, BarChart3, Activity,
  MessageSquare, UserCheck, Hash,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { StatsCard } from '../shared/components/StatsCard';
import { useAuth } from '../core/auth/AuthContext';
import {
  getDashboardStats,
  getUserGrowthTrend, getTaskTrend,
  getAttendanceTrend, getMessageTrend, getMostActiveGroups,
  getMostActiveUsers, getTeacherPerformance,
  type UserGrowthPoint, type TaskTrendPoint,
  type AttendanceTrendPoint, type MessageTrendPoint,
  type ActiveGroup, type ActiveUser, type TeacherPerformance,
  type TaskAnalytics, type AttendanceAnalytics, type UserStats,
  type DashboardStats
} from '../core/services/analyticsService';

type Period = 7 | 30 | 90;

const PIE_COLORS = ['#10B981', '#EF4444', '#F59E0B', '#3B82F6'];

function FilterBar({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex w-full flex-wrap gap-1 rounded-lg bg-slate-100 p-1 sm:w-auto">
      {([7, 30, 90] as Period[]).map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors sm:px-3 ${
            value === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {p === 7 ? 'Week' : p === 30 ? 'Month' : 'Quarter'}
        </button>
      ))}
    </div>
  );
}

function useIsSmallScreen(breakpoint = 640) {
  const [small, setSmall] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const onResize = () => setSmall(window.innerWidth < breakpoint);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [breakpoint]);
  return small;
}

export function AnalyticsPage() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>(30);
  const isSmall = useIsSmallScreen(640);

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
      const [dashStats, ug, tt, at, mt, ag, au, tp] = await Promise.all([
        getDashboardStats(),
        getUserGrowthTrend(period),
        getTaskTrend(period),
        getAttendanceTrend(period),
        getMessageTrend(period),
        getMostActiveGroups(5),
        getMostActiveUsers(5),
        getTeacherPerformance(10),
      ]);
      setUserStats(dashStats.users);
      setTaskStats(dashStats.tasks);
      setAttendanceStats(dashStats.attendance);
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

  const chartHeight = isSmall ? 220 : window.innerWidth < 1024 ? 280 : 320;

  if (loading) {
    return (
      <div className="loading-page min-h-[400px]">
        <div className="spinner" aria-label="Loading analytics" />
      </div>
    );
  }

  return (
    <div className="page-container space-y-4 overflow-hidden sm:space-y-6 lg:space-y-8">
      {/* Page Header */}
      <div className="page-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="page-title">Platform Analytics</h1>
          <p className="page-subtitle">Deep dive into platform growth and engagement.</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="kpi-grid" aria-label="Key performance indicators">
        <StatsCard
          title="Total Users"
          value={(userStats?.totalStudents ?? 0) + (userStats?.totalTeachers ?? 0) + (userStats?.totalCoordinators ?? 0) + (userStats?.totalAdmins ?? 0)}
          icon={<Users className="h-5 w-5 sm:h-6 sm:w-6" />}
          description="All registered users"
        />
        <StatsCard
          title="Task Completion Rate"
          value={`${taskStats?.completionRate ?? 0}%`}
          icon={<CheckSquare className="h-5 w-5 sm:h-6 sm:w-6" />}
          description={`${taskStats?.completed ?? 0}/${taskStats?.total ?? 0} tasks`}
        />
        <StatsCard
          title="Attendance Rate"
          value={`${attendanceStats?.rate ?? 0}%`}
          icon={<Activity className="h-5 w-5 sm:h-6 sm:w-6" />}
          description={`${attendanceStats?.present ?? 0} present of ${attendanceStats?.total ?? 0}`}
        />
        <StatsCard
          title="Active Tasks"
          value={(taskStats?.pending ?? 0) + (taskStats?.inProgress ?? 0) + (taskStats?.overdue ?? 0)}
          icon={<BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" />}
          description="Non-completed tasks"
        />
      </div>

      {/* A. User Growth Trend */}
      <div className="card overflow-hidden">
        <div className="card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
            <TrendingUp className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
            User Growth Trend
          </h2>
          <FilterBar value={period} onChange={setPeriod} />
        </div>
        <div className="card-body">
          {userGrowth.length === 0 ? (
            <div className="empty-state">
              <BarChart3 className="empty-state-icon" />
              <p className="empty-state-desc">No user data for this period.</p>
            </div>
          ) : (
            <div className="min-w-0" style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={userGrowth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: isSmall ? 9 : 11 }}
                    tickFormatter={d => d.slice(5)}
                    interval={isSmall ? 'preserveStartEnd' : undefined}
                  />
                  <YAxis tick={{ fontSize: isSmall ? 9 : 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} dot={false} name="Total Users" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* B. Task Analytics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <CheckSquare className="h-4 w-4 text-amber-600 sm:h-5 sm:w-5" />
              Tasks Created vs Completed
            </h2>
          </div>
          <div className="card-body">
            {taskTrend.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No task data for this period.</p>
              </div>
            ) : (
              <div className="min-w-0" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isSmall ? 9 : 11 }}
                      tickFormatter={d => d.slice(5)}
                      interval={isSmall ? 'preserveStartEnd' : undefined}
                    />
                    <YAxis tick={{ fontSize: isSmall ? 9 : 11 }} />
                    <Tooltip />
                    <Bar dataKey="created" fill="#F59E0B" name="Created" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="completed" fill="#10B981" name="Completed" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <Hash className="h-4 w-4 text-purple-600 sm:h-5 sm:w-5" />
              Task Status Distribution
            </h2>
          </div>
          <div className="card-body">
            {taskPieData.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No tasks created yet.</p>
              </div>
            ) : (
              <div className="min-w-0" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={taskPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={isSmall ? 70 : 90}
                      label={isSmall ? false : ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {taskPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    {isSmall && <Legend />}
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* C. Attendance Analytics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <Activity className="h-4 w-4 text-blue-600 sm:h-5 sm:w-5" />
              Attendance Rate Trend
            </h2>
          </div>
          <div className="card-body">
            {attendanceTrend.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No attendance data for this period.</p>
              </div>
            ) : (
              <div className="min-w-0" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={attendanceTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isSmall ? 9 : 11 }}
                      tickFormatter={d => d.slice(5)}
                      interval={isSmall ? 'preserveStartEnd' : undefined}
                    />
                    <YAxis tick={{ fontSize: isSmall ? 9 : 11 }} domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Line type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={2} dot={false} name="Attendance Rate" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <Activity className="h-4 w-4 text-indigo-600 sm:h-5 sm:w-5" />
              Present vs Absent
            </h2>
          </div>
          <div className="card-body">
            {attendancePieData.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No attendance records yet.</p>
              </div>
            ) : (
              <div className="min-w-0" style={{ height: chartHeight }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={attendancePieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={isSmall ? 70 : 90}
                      label={isSmall ? false : ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {attendancePieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    {isSmall && <Legend />}
                    {!isSmall && <Legend />}
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* E. Communication Analytics */}
      <div className="card overflow-hidden">
        <div className="card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
            <MessageSquare className="h-4 w-4 text-cyan-600 sm:h-5 sm:w-5" />
            Messages Sent Per Day
          </h2>
          <FilterBar value={period} onChange={setPeriod} />
        </div>
        <div className="card-body">
          {messageTrend.length === 0 ? (
            <div className="empty-state">
              <BarChart3 className="empty-state-icon" />
              <p className="empty-state-desc">No messages sent in this period.</p>
            </div>
          ) : (
            <div className="min-w-0" style={{ height: chartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={messageTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: isSmall ? 9 : 11 }}
                    tickFormatter={d => d.slice(5)}
                    interval={isSmall ? 'preserveStartEnd' : undefined}
                  />
                  <YAxis tick={{ fontSize: isSmall ? 9 : 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#06B6D4" name="Messages" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Active Groups & Active Users */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <Users className="h-4 w-4 text-rose-600 sm:h-5 sm:w-5" />
              Most Active Conversations
            </h2>
          </div>
          <div className="card-body">
            {activeGroups.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No conversation data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeGroups.map((g, i) => (
                  <div key={g.id} className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="w-5 text-xs font-bold text-slate-400">{i + 1}.</span>
                      <span className="truncate text-sm text-slate-700">{g.name}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">{g.messageCount} msgs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <UserCheck className="h-4 w-4 text-emerald-600 sm:h-5 sm:w-5" />
              Most Active Users
            </h2>
          </div>
          <div className="card-body">
            {activeUsers.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No user activity data.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeUsers.map((u, i) => (
                  <div key={u.id} className="flex min-w-0 items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="w-5 text-xs font-bold text-slate-400">{i + 1}.</span>
                      <span className="truncate text-sm text-slate-700">{u.display_name}</span>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">{u.role}</span>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-slate-900">{u.messageCount} msgs</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* F. Teacher Performance Analytics */}
      {profile?.role === 'admin' && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 sm:text-lg">
              <TrendingUp className="h-4 w-4 text-orange-600 sm:h-5 sm:w-5" />
              Teacher Performance
            </h2>
          </div>
          <div className="card-body">
            {teacherPerformance.length === 0 ? (
              <div className="empty-state">
                <BarChart3 className="empty-state-icon" />
                <p className="empty-state-desc">No teacher data available.</p>
              </div>
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Teacher</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Tasks Completed</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Attendance Managed</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Students Assigned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teacherPerformance.map(t => (
                        <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-2 font-medium text-slate-900">{t.display_name}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{t.tasksCompleted}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{t.attendanceManaged}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{t.studentsAssigned}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="space-y-3 sm:hidden">
                  {teacherPerformance.map(t => (
                    <div key={t.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                      <p className="mb-3 font-semibold text-slate-900">{t.display_name}</p>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div>
                          <p className="font-bold text-slate-900">{t.tasksCompleted}</p>
                          <p className="text-slate-500">Tasks</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{t.attendanceManaged}</p>
                          <p className="text-slate-500">Attendance</p>
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{t.studentsAssigned}</p>
                          <p className="text-slate-500">Students</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
