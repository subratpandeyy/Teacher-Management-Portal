import { memo, useCallback, useMemo, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  BookOpen,
  CheckSquare,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Search,
  Bell,
  HelpCircle,
  UserCheck,
  Users,
  UsersRound,
  X,
  ChevronDown,
} from 'lucide-react';
import logo from '../assets/logo.png';
import { useAuth } from '../core/auth/AuthContext';
import { useUnreadMessagesContext } from '../core/hooks/UnreadMessagesContext';
import type { UserRole } from '../../../shared/types';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  allowedRoles?: UserRole[];
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/users', label: 'Users', icon: Users, allowedRoles: ['admin'] },
  { to: '/coordinators', label: 'Coordinators', icon: UserCheck, allowedRoles: ['admin'] },
  { to: '/teachers', label: 'Teachers', icon: GraduationCap, allowedRoles: ['admin', 'coordinator'] },
  { to: '/students', label: 'Students', icon: UsersRound, allowedRoles: ['admin', 'coordinator'] },
  { to: '/groups', label: 'Groups', icon: Users, allowedRoles: ['admin', 'coordinator', 'teacher'] },
  { to: '/tasks', label: 'Tasks', icon: CheckSquare, allowedRoles: ['admin', 'coordinator'] },
  { to: '/attendance', label: 'Attendance', icon: ClipboardList, allowedRoles: ['admin', 'coordinator', 'teacher'] },
  { to: '/analytics', label: 'Analytics', icon: BarChart3, allowedRoles: ['admin', 'coordinator'] },
  { to: '/broadcasts', label: 'Broadcasts', icon: Megaphone, allowedRoles: ['admin'] },
  { to: '/documents', label: 'Materials', icon: BookOpen, allowedRoles: ['admin', 'coordinator', 'teacher'] },
  { to: '/chat', label: 'Chat', icon: MessageSquare, allowedRoles: ['admin', 'coordinator', 'teacher'] },
];

const ROLE_BADGES: Record<string, string> = {
  admin: 'bg-rose-50 text-rose-700',
  coordinator: 'bg-amber-50 text-amber-700',
  teacher: 'bg-emerald-50 text-emerald-700',
  student: 'bg-blue-50 text-blue-700',
};

const SidebarContent = memo(function SidebarContent({
  onSignOut,
  onClose,
  chatUnread,
}: {
  onSignOut: () => void;
  onClose?: () => void;
  chatUnread: number;
}) {
  const { profile } = useAuth();

  const filteredLinks = useMemo(
    () =>
      navItems.filter((item) => {
        if (!item.allowedRoles) return true;
        if (!profile) return false;
        return item.allowedRoles.includes(profile.role);
      }),
    [profile],
  );

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-blue-600 to-blue-500">
      <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <img src={logo} alt="Genieclasses" className="h-7 w-7 bg-white rounded-lg p-1" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">Genieclasses</p>
          <p className="text-xs text-gray-300 capitalize">{profile?.role} Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {filteredLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-white hover:bg-gray-50 hover:text-blue-600'
              }`
            }
          >
            <l.icon className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span className="flex-1 text-left">{l.label}</span>
            {l.to === '/chat' && chatUnread > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                {chatUnread > 99 ? '99+' : chatUnread}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className="mb-2 flex items-center gap-3 rounded-lg px-3 py-2">
          <div className="avatar-sm shrink-0">
            {profile?.display_name?.charAt(0)?.toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {profile?.display_name ?? 'User'}
            </p>
            <p className="truncate text-xs text-white capitalize">{profile?.role}</p>
          </div>
        </div>
      </div>
    </div>
  );
});

export function AdminLayout({ onSignOut }: { onSignOut: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { profile } = useAuth();
  const { totalUnread } = useUnreadMessagesContext();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-gray-100 bg-white shadow-sm lg:flex">
        <SidebarContent onSignOut={onSignOut} chatUnread={totalUnread} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-blue-600 shadow-xl transition-transform duration-300 lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-end px-4 py-2">
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeDrawer}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent onSignOut={onSignOut} onClose={closeDrawer} chatUnread={totalUnread} />
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur-xl py-0.5">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open menu"
                onClick={openDrawer}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-64 rounded-xl border border-gray-100 bg-gray-50 py-2 pl-9 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-50"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="ml-2 flex items-center gap-3 rounded-xl p-1 transition-colors text-gray-800 hover:bg-red-500 hover:text-white">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Sign out
        </button>
      </div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
