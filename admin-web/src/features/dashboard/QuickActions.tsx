import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Megaphone, UserPlus, GraduationCap, Users, UserCheck,
  type LucideIcon,
} from 'lucide-react';

interface QuickAction {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  hoverBg: string;
  route?: string;
}

const actions: QuickAction[] = [
  { label: 'Create Broadcast', icon: Megaphone, color: 'text-blue-600', bgColor: 'bg-blue-50', hoverBg: 'hover:bg-blue-100', route: '/broadcasts' },
  { label: 'Add Teacher', icon: GraduationCap, color: 'text-emerald-600', bgColor: 'bg-emerald-50', hoverBg: 'hover:bg-emerald-100', route: '/teachers' },
  { label: 'Add Student', icon: UserPlus, color: 'text-purple-600', bgColor: 'bg-purple-50', hoverBg: 'hover:bg-purple-100', route: '/students' },
  { label: 'Create Group', icon: Users, color: 'text-amber-600', bgColor: 'bg-amber-50', hoverBg: 'hover:bg-amber-100', route: '/groups' },
  { label: 'Assign Coordinator', icon: UserCheck, color: 'text-rose-600', bgColor: 'bg-rose-50', hoverBg: 'hover:bg-rose-100', route: '/coordinators' },
];

export function QuickActions() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
      className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm"
    >
      <h2 className="mb-4 text-sm font-semibold text-gray-900">Quick Actions</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {actions.map((action, idx) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: 0.3 + idx * 0.05 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => action.route && navigate(action.route)}
              className={`flex flex-col items-center gap-2 rounded-xl border border-gray-100 p-4 transition-all duration-200 ${action.hoverBg} hover:shadow-sm hover:border-gray-200`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${action.bgColor} ${action.color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <span className="text-xs font-medium text-gray-700 text-center leading-tight">
                {action.label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
