import { motion } from 'framer-motion';
import {
  UserPlus, GraduationCap, Users, CheckSquare, MessageSquare,
  ClipboardCheck, BookOpen, CalendarCheck, Hash, Activity,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityEvent } from '../../core/services/analyticsService';
import { relativeTime } from '../../core/services/analyticsService';

const ACTIVITY_ICONS: Record<ActivityEvent['type'], LucideIcon> = {
  user_registered: UserPlus,
  teacher_added: GraduationCap,
  student_added: Users,
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
  task_completed: 'bg-emerald-50 text-emerald-600',
  group_created: 'bg-rose-50 text-rose-600',
  chat_sent: 'bg-cyan-50 text-cyan-600',
  attendance_taken: 'bg-indigo-50 text-indigo-600',
  document_uploaded: 'bg-orange-50 text-orange-600',
  assignment_created: 'bg-teal-50 text-teal-600',
};

interface ActivityFeedProps {
  activities: ActivityEvent[];
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2, ease: 'easeOut' }}
      className="rounded-2xl border border-gray-100 bg-white shadow-sm"
    >
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-600" />
          Recent Activity
        </h2>
      </div>
      <div className="max-h-[560px] overflow-y-auto">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="mb-3 h-10 w-10 text-gray-200" />
            <p className="text-sm font-medium text-gray-400">No recent activity yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {activities.map((event, idx) => {
              const Icon = ACTIVITY_ICONS[event.type];
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: idx * 0.02 }}
                  className="flex items-start gap-3 px-6 py-3.5 transition-colors hover:bg-gray-50/50"
                >
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ACTIVITY_COLORS[event.type]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-700 leading-snug">
                      {event.description}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                      <Hash className="h-3 w-3" />
                      {event.type.replace(/_/g, ' ')} &middot; {relativeTime(event.created_at)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
