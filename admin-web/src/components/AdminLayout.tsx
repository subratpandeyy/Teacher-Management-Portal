import { NavLink, Outlet } from 'react-router-dom';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Users,
} from 'lucide-react';
import logo from '../assets/logo.png';

const links = [
  { to: '/', label: 'Teachers & Chat', icon: LayoutDashboard },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
  { to: '/documents', label: 'Documents', icon: FileText },
];

export function AdminLayout({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5">
          <div className="flex items-center gap-3">
            {/* <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-blue-500 text-lg font-bold text-white shadow-sm"> */}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shadow-sm">
              <img src={logo} alt="Genieclasses Logo" className="h-10 w-10" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">Genieclasses</p>
              <p className="text-xs text-slate-500">Teachers Portal</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `gc-sidebar-link ${isActive ? 'gc-sidebar-link-active' : ''}`
              }
            >
              <l.icon className="h-5 w-5 shrink-0" strokeWidth={2} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onSignOut}
            className="gc-sidebar-link w-full text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut className="h-5 w-5" strokeWidth={2} />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-8 py-4 backdrop-blur">
          <h1 className="text-lg font-bold text-slate-900">Genieclasses Teachers Portal</h1>
          <p className="text-sm text-slate-500">Administrator dashboard</p>
        </header>
        <main className="flex-1 overflow-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
