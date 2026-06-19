import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { motion } from 'framer-motion';
import { Activity, TrendingUp, BarChart3, LineChart as LineChartIcon } from 'lucide-react';
import type { UserGrowthPoint, TaskTrendPoint, AttendanceTrendPoint, MessageTrendPoint } from '../../core/services/analyticsService';

interface TooltipPayloadEntry {
  color: string;
  name: string;
  value: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-lg">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      {payload.map((entry, idx) => (
        <p key={idx} className="text-sm font-bold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
};

const CHART_COLORS = {
  blue: '#2563EB',
  green: '#10B981',
  purple: '#8B5CF6',
  orange: '#F59E0B',
};

interface ChartCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
}

function ChartCard({ title, subtitle, icon, children, delay = 0 }: ChartCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: 'easeOut' }}
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className="h-64 w-full">
        {children}
      </div>
    </motion.div>
  );
}

interface StudentGrowthChartProps {
  data: UserGrowthPoint[];
}

export function StudentGrowthChart({ data }: StudentGrowthChartProps) {
  if (!data.length) {
    return (
      <ChartCard title="Student Growth" subtitle="New student registrations over time" icon={<TrendingUp className="h-5 w-5" />} delay={0}>
        <div className="flex h-full items-center justify-center text-sm text-gray-400">No data available</div>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Student Growth" subtitle="New student registrations over time" icon={<TrendingUp className="h-5 w-5" />} delay={0}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <defs>
            <linearGradient id="studentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={CHART_COLORS.blue} stopOpacity={0.2} />
              <stop offset="95%" stopColor={CHART_COLORS.blue} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="count" stroke={CHART_COLORS.blue} strokeWidth={2} fill="url(#studentGradient)" name="Students" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface TeacherActivityChartProps {
  data: TaskTrendPoint[];
}

export function TeacherActivityChart({ data }: TeacherActivityChartProps) {
  if (!data.length) {
    return (
      <ChartCard title="Teacher Activity" subtitle="Daily active teachers" icon={<Activity className="h-5 w-5" />} delay={0.1}>
        <div className="flex h-full items-center justify-center text-sm text-gray-400">No data available</div>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Teacher Activity" subtitle="Daily active teachers" icon={<Activity className="h-5 w-5" />} delay={0.1}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="created" fill={CHART_COLORS.green} radius={[4, 4, 0, 0]} maxBarSize={32} name="Tasks Created" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface AttendanceTrendGraphProps {
  data: AttendanceTrendPoint[];
}

export function AttendanceTrendGraph({ data }: AttendanceTrendGraphProps) {
  if (!data.length) {
    return (
      <ChartCard title="Attendance Trend" subtitle="Daily attendance rate" icon={<BarChart3 className="h-5 w-5" />} delay={0.2}>
        <div className="flex h-full items-center justify-center text-sm text-gray-400">No data available</div>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Attendance Trend" subtitle="Daily attendance rate" icon={<BarChart3 className="h-5 w-5" />} delay={0.2}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <Tooltip content={<CustomTooltip />} />
          <Line type="monotone" dataKey="rate" stroke={CHART_COLORS.purple} strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 0 }} name="Rate" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

interface GroupCreationTrendProps {
  data: MessageTrendPoint[];
}

export function GroupCreationTrend({ data }: GroupCreationTrendProps) {
  if (!data.length) {
    return (
      <ChartCard title="Group Creation" subtitle="New groups formed per day" icon={<LineChartIcon className="h-5 w-5" />} delay={0.3}>
        <div className="flex h-full items-center justify-center text-sm text-gray-400">No data available</div>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Group Creation" subtitle="New groups formed per day" icon={<LineChartIcon className="h-5 w-5" />} delay={0.3}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="count" fill={CHART_COLORS.orange} radius={[4, 4, 0, 0]} maxBarSize={32} name="Messages" />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
