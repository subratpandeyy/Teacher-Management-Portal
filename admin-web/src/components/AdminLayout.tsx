import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  Users,
  X,
} from 'lucide-react';
import logo from '../assets/logo.png';

const links = [
  { to: '/', label: 'Teachers & Chat', icon: LayoutDashboard },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
  { to: '/documents', label: 'Documents', icon: FileText },
];

function SidebarContent({ onSignOut, onClose }: { onSignOut: () => void; onClose?: () => void }) {
  return (
    <>
      <div className="border-b border-slate-100 px-5 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-20 w-20 items-center justify-center rounded-xl">
            <img src={logo} alt="Genieclasses Logo" className="h-20" />
          </div>
          <div>
            <p className="text-md font-bold leading-tight text-slate-900">Genieclasses</p>
            <p className="text-sm text-slate-500">Teachers Portal</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            onClick={onClose}
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
          className="gc-sidebar-link w-full text-gray-600 hover:bg-gray-50 hover:text-gray-700"
        >
          <LogOut className="h-5 w-5" strokeWidth={2} />
          Sign out
        </button>
      </div>
    </>
  );
}

export function AdminLayout({ onSignOut }: { onSignOut: () => void }) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* ── Desktop sidebar ─────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-100 bg-white shadow-sm lg:flex">
        <SidebarContent onSignOut={onSignOut} />
      </aside>

      {/* ── Mobile drawer overlay ────────────────────────── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer panel ──────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-100 bg-white shadow-xl transition-transform duration-300 lg:hidden ${
          drawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-end px-4 pt-4">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent onSignOut={onSignOut} onClose={() => setDrawerOpen(false)} />
      </aside>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-8">
            {/* Hamburger — mobile only */}
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                Genieclasses Teachers Portal
              </h1>
              <p className="hidden text-sm text-slate-500 sm:block">Administrator dashboard</p>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
