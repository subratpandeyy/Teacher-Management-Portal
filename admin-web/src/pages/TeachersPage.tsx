import { useEffect, useState } from 'react';
import type { TeacherRow } from '../lib/supabase';
import { listTeachers } from '../lib/features';
import { TeacherDetailPanel } from '../components/TeacherDetailPanel';

export function TeachersPage() {
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
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border border-slate-200 bg-white">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-100">
        <div className="border-b px-4 py-3 text-xs font-semibold uppercase text-slate-500">
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
                  className={`w-full border-b px-4 py-3 text-left hover:bg-slate-50 ${selectedId === t.id ? 'bg-blue-50' : ''}`}
                >
                  <div className="font-medium">{t.display_name ?? 'Unnamed'}</div>
                  <div className="text-xs text-slate-500">{t.email}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="flex-1 overflow-y-auto p-6">
        {selected ? (
          <TeacherDetailPanel teacher={selected} key={selected.id} />
        ) : (
          <p className="text-slate-500">Select a teacher to view their private chat, documents, and availability.</p>
        )}
      </div>
    </div>
  );
}
