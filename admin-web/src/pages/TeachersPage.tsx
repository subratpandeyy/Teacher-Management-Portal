import { useEffect, useState } from 'react';
import { MessageCircle, Users } from 'lucide-react';
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
    <div className="space-y-6">
      <div>
        <h2 className="gc-page-title">Teachers & Chat</h2>
        <p className="gc-page-subtitle">
          Select a teacher for private messaging, documents, and availability.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="gc-stat-card">
          <div className="flex items-center gap-2 text-slate-500">
            <Users className="h-6 w-6 text-green-600" />
            <span className="text-sm font-semibold uppercase tracking-wide">Teachers</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{teachers.length}</p>
          <p className="text-xs text-slate-400">Total Teachers Onboarded</p>
        </div>
        <div className="gc-stat-card">
          <div className="flex items-center gap-2 text-slate-500">
            <MessageCircle className="h-6 w-6 text-blue-600" />
            <span className="text-sm font-semibold uppercase tracking-wide">Active chats</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{selected ? 1 : 0}</p>
          <p className="text-xs text-slate-400">Select a teacher to open chat</p>
        </div>
      </div>

      <div className="gc-card flex h-[calc(100vh-14rem)] overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/50">
          <div className="border-b border-slate-100 bg-white px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500">
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
                    className={`w-full border-b border-slate-50 px-4 py-3 text-left transition hover:bg-blue-50/50 ${
                      selectedId === t.id ? 'border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50 to-blue-50/30' : ''
                    }`}
                  >
                    <div className="font-semibold text-slate-900">{t.display_name ?? 'Unnamed'}</div>
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
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                <MessageCircle className="h-7 w-7 text-blue-500" />
              </div>
              <p className="font-medium text-slate-700">Select a teacher</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                View private chat, shared documents, and availability for one teacher at a time.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
