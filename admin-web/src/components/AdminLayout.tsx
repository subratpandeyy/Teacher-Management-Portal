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
  Settings,
  UserCheck,
  Users,
  UsersRound,
  X,
  Bell,
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
  { to: '/settings', label: 'Settings', icon: Settings, allowedRoles: ['admin'] },
];

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
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg">
          <img src={logo} alt="Genieclasses" className="h-10 w-10 bg-white rounded-lg p-1" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">Genieclasses</p>
          <p className="text-xs text-slate-200 capitalize">{profile?.role} Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {filteredLinks.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'sidebar-link-active' : ''}`
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
        <button
          type="button"
          onClick={onSignOut}
          className="sidebar-link w-full text-slate-200 hover:bg-red-500 hover:text-white"
        >
          <LogOut className="h-4 w-4" strokeWidth={2} />
          Sign out
        </button>
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
    <div className="flex min-h-screen bg-canvas">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white lg:flex">
        <SidebarContent onSignOut={onSignOut} chatUnread={totalUnread} />
      </aside>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-200 bg-white shadow-xl transition-transform duration-300 lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center bg-blue-600 justify-end px-4 pt-4">
          <button
            type="button"
            aria-label="Close menu"
            onClick={closeDrawer}
            className="btn-ghost rounded-lg p-2 bg-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent onSignOut={onSignOut} onClose={closeDrawer} chatUnread={totalUnread} />
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-56">
        <header className="sticky top-0 z-20 border-b border-slate-200 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-white/30">
          <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Open menu"
                onClick={openDrawer}
                className="btn-ghost rounded-lg p-2 lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-900 sm:text-lg">
                  {profile?.role ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1) : ''} Portal
                </h1>
                <p className="text-xs text-slate-600 capitalize">
                  Welcome back, {profile?.display_name?.split(' ')[0] ?? 'User'}
                </p>
              </div>
            </div>

            {/* <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost relative rounded-lg p-2"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-slate-500" />
                {totalUnread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </button>
            </div> */}
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
