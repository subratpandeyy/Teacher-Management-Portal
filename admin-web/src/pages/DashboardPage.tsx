import { useEffect, useState } from 'react';
import type { TeacherRow } from '../lib/supabase';
import { listTeachers } from '../lib/api';
import { TeacherDetailPanel } from '../components/TeacherDetailPanel';

export function DashboardPage({ onSignOut }: { onSignOut: () => void }) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const selected = teachers.find((t) => t.id === selectedId) ?? null;

  useEffect(() => {
    listTeachers().then(({ data, error: err }) => {
      if (err) setError(err.message);
      else setTeachers((data as TeacherRow[]) ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-bold">Teacher Portal Admin</h1>
          <p className="text-sm text-slate-500">
            Data is always scoped to the selected teacher — no cross-teacher views.
          </p>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Sign out
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Teachers ({teachers.length})
          </div>
          {loading ? (
            <p className="p-4 text-sm text-slate-500">Loading…</p>
          ) : error ? (
            <p className="p-4 text-sm text-red-600">{error}</p>
          ) : (
            <ul>
              {teachers.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 ${
                      selectedId === t.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="font-medium">{t.display_name ?? 'Unnamed'}</div>
                    <div className="text-xs text-slate-500">{t.email}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto p-6">
          {selected ? (
            <TeacherDetailPanel teacher={selected} key={selected.id} />
          ) : (
            <p className="text-slate-500">Select a teacher to manage their data.</p>
          )}
        </main>
      </div>
    </div>
  );
}
