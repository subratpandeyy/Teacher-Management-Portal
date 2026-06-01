import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: 'Teachers & Chat' },
  { to: '/groups', label: 'Groups' },
  { to: '/broadcasts', label: 'Broadcasts' },
  { to: '/documents', label: 'Documents' },
];

export function AdminLayout({ onSignOut }: { onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold">EduBridge Connect Admin</h1>
          <button type="button" onClick={onSignOut} className="text-sm text-slate-600 hover:text-slate-900">
            Sign out
          </button>
        </div>
        <nav className="mt-3 flex flex-wrap gap-2">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
