import { motion } from 'framer-motion';
import { CheckCircle, Users, MessageSquare, ClipboardCheck } from 'lucide-react';
import type { DashboardStats } from '../../core/services/analyticsService';

interface PerformanceCardsProps {
  stats: DashboardStats;
}

interface PerfCardData {
  label: string;
  value: string | number;
  progress: number;
  icon: React.ReactNode;
  color: string;
}

export function PerformanceCards({ stats }: PerformanceCardsProps) {
  const cards: PerfCardData[] = [
    {
      label: 'Attendance Rate',
      value: `${stats.attendance.rate}%`,
      progress: stats.attendance.rate,
      icon: <ClipboardCheck className="h-5 w-5" />,
      color: 'text-blue-600',
    },
    {
      label: 'Task Completion',
      value: `${stats.tasks.completionRate}%`,
      progress: stats.tasks.completionRate,
      icon: <CheckCircle className="h-5 w-5" />,
      color: 'text-emerald-600',
    },
    {
      label: 'Active Coordinators',
      value: stats.users.totalCoordinators,
      progress: Math.min(100, (stats.users.totalCoordinators / Math.max(1, stats.users.totalCoordinators + stats.users.totalTeachers)) * 100),
      icon: <Users className="h-5 w-5" />,
      color: 'text-purple-600',
    },
    {
      label: 'Messages Today',
      value: stats.messagesToday,
      progress: Math.min(100, (stats.messagesToday / Math.max(1, stats.attendance.total)) * 100),
      icon: <MessageSquare className="h-5 w-5" />,
      color: 'text-amber-600',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15, ease: 'easeOut' }}
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Performance Overview</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, idx) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.15 + idx * 0.05 }}
            className="rounded-xl border border-gray-50 bg-gray-50/50 p-4 transition-all duration-200 hover:bg-gray-50"
          >
            <div className="mb-3">
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ${card.color}`}>
                {card.icon}
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className="text-2xl font-bold text-gray-900 mb-2">{card.value}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${card.progress}%` }}
                transition={{ duration: 0.8, delay: 0.3 + idx * 0.1, ease: 'easeOut' }}
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
              />
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
