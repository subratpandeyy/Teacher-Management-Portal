import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { TeacherRow } from '../lib/supabase';
import {
  fetchAdminDocumentsForTeacher,
  fetchTeacherAvailability,
  fetchTeacherUploadsForAdmin,
  shareDocumentInChat,
} from '../lib/features';
import { openDocumentInBrowser } from '../lib/openDocument';
import { ChatTab } from '../features/chat/ChatTab';

import { X } from 'lucide-react';

type Tab = 'chat' | 'documents' | 'availability';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TeacherDetailPanel({ teacher, onClose }: { teacher: TeacherRow; onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('chat');
  const teacherId = teacher.id;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-100 bg-white shadow-2xl transition-transform duration-300 sm:w-2/3 lg:w-1/2">
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{teacher.display_name ?? 'Teacher Details'}</h2>
            <p className="text-xs text-slate-400">ID: {teacherId}</p>
          </div>
          <button 
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-sm text-slate-500">
            Private view for this teacher only — messages, documents, and availability are isolated.
          </p>

          {/* Tabs */}
          <div className="mt-6 flex gap-2 border-b border-slate-50 pb-4">
            {(['chat', 'documents', 'availability'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-xl px-4 py-2 text-sm font-bold capitalize transition ${
                  tab === t
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === 'chat' ? <ChatTab teacherId={teacherId} /> : null}
            {tab === 'documents' ? <DocumentsTab teacherId={teacherId} /> : null}
            {tab === 'availability' ? <AvailabilityTab teacherId={teacherId} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocumentsTab({ teacherId }: { teacherId: string }) {
  const [fromAdmin, setFromAdmin] = useState<
    {
      id: string;
      title: string;
      storage_path: string;
      storage_bucket?: string | null;
      mime_type?: string | null;
      assigned_at?: string;
    }[]
  >([]);
  const [fromTeacher, setFromTeacher] = useState<
    {
      id: string;
      title: string;
      storage_path: string;
      storage_bucket?: string | null;
      mime_type?: string | null;
      created_at?: string;
    }[]
  >([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminDocumentsForTeacher(teacherId).then(({ data, error: err }) => {
      if (err) setError(err.message);
      else {
        const mapped = (data ?? []).flatMap((row: Record<string, unknown>) => {
          const doc = row.documents as
            | { id: string; title: string; storage_path: string; storage_bucket?: string; mime_type?: string }
            | { id: string; title: string; storage_path: string }[]
            | null;
          const d = Array.isArray(doc) ? doc[0] : doc;
          if (!d) return [];
          return [{
            id: d.id,
            title: d.title,
            storage_path: d.storage_path,
            storage_bucket: (d as { storage_bucket?: string }).storage_bucket ?? null,
            mime_type: (d as { mime_type?: string }).mime_type ?? null,
            assigned_at: row.assigned_at as string | undefined,
          }];
        });
        setFromAdmin(mapped);
      }
    });

    fetchTeacherUploadsForAdmin(teacherId).then(({ data, error: err }) => {
      if (err) setError(err.message);
      else {
        setFromTeacher(
          ((data ?? []) as Record<string, unknown>[]).map((row) => ({
            id: String(row.id),
            title: String(row.title ?? row.file_name),
            storage_path: String(row.storage_path),
            storage_bucket: (row.storage_bucket as string | null) ?? null,
            mime_type: (row.mime_type as string | null) ?? null,
            created_at: row.created_at as string | undefined,
          }))
        );
      }
    });
  }, [teacherId]);

  async function openDoc(doc: {
    storage_path: string;
    storage_bucket?: string | null;
    mime_type?: string | null;
  }) {
    const result = await openDocumentInBrowser(doc);
    if (result.ok === false) {
      setError(result.error);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <section>
        <h3 className="font-semibold">Uploaded by teacher</h3>
        <ul className="mt-2 space-y-2">
          {fromTeacher.length === 0 ? (
            <li className="text-sm text-slate-500">No uploads from this teacher yet.</li>
          ) : (
            fromTeacher.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
                <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                <button
                  type="button"
                  onClick={() => openDoc(d)}
                  className="shrink-0 text-sm text-blue-600"
                >
                  Open
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h3 className="font-semibold">Shared with teacher</h3>
        <ul className="mt-2 space-y-2">
          {fromAdmin.length === 0 ? (
            <li className="text-sm text-slate-500">No documents shared yet.</li>
          ) : (
            fromAdmin.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-white p-3">
                <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
                <span className="flex shrink-0 gap-3">
                  <button
                    type="button"
                    onClick={() => shareDocumentInChat(teacherId, d.storage_path, d.title, d.mime_type)}
                    className="text-sm text-slate-600"
                  >
                    Send in chat
                  </button>
                  <button type="button" onClick={() => openDoc(d)} className="text-sm text-blue-600">
                    Open
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

function AvailabilityTab({ teacherId }: { teacherId: string }) {
  const [entries, setEntries] = useState<
    {
      id: string;
      kind: string;
      start_date: string | null;
      end_date: string | null;
      day_of_week: number | null;
      start_time: string;
      end_time: string;
      notes: string | null;
    }[]
  >([]);

  useEffect(() => {
    fetchTeacherAvailability(teacherId).then(({ data }) => {
      setEntries((data as typeof entries) ?? []);
    });
  }, [teacherId]);

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600">View-only. Teachers manage their own availability in the mobile app.</p>
      <ul className="space-y-2">
        {entries.length === 0 ? (
          <li className="text-sm text-slate-500">No availability set.</li>
        ) : (
          entries.map((e) => (
            <li key={e.id} className="rounded-lg border bg-white p-3 text-sm">
              {e.kind === 'recurring_weekly' ? (
                <div className="font-medium">
                  Every {DAYS[e.day_of_week ?? 0]} · {e.start_time.slice(0, 5)} – {e.end_time.slice(0, 5)}
                </div>
              ) : (
                <div className="break-words font-medium">
                  {e.start_date} → {e.end_date} · {e.start_time.slice(0, 5)} – {e.end_time.slice(0, 5)}
                </div>
              )}
              {e.notes ? <p className="mt-1 text-slate-600">{e.notes}</p> : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
