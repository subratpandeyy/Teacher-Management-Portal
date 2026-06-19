import { motion } from 'framer-motion';
import {
  CalendarDays, AlertCircle, Wifi, Users, ShieldCheck, Bell,
} from 'lucide-react';

interface WidgetsProps {
  totalUsers: number;
  totalTeachers: number;
  totalCoordinators: number;
  totalStudents: number;
}

export function Widgets({ totalUsers, totalTeachers, totalCoordinators }: WidgetsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.25, ease: 'easeOut' }}
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Upcoming Events</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CalendarDays className="mb-2 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">No upcoming events</p>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3, ease: 'easeOut' }}
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <Bell className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Announcements</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Bell className="mb-2 h-8 w-8 text-gray-200" />
          <p className="text-sm text-gray-400">No announcements</p>
        </div>
      </motion.div> */}

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.35, ease: 'easeOut' }}
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">System Status</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-gray-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Total Users</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{totalUsers}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <Wifi className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Online Teachers</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{totalTeachers}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Active Coordinators</span>
            </div>
            <span className="text-sm font-bold text-gray-900">{totalCoordinators}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-gray-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-600">Server Status</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Connected
            </span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
