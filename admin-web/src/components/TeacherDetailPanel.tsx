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

import { X, FileText, Upload, Calendar, MessageSquare, ExternalLink, Send } from 'lucide-react';

type Tab = 'chat' | 'documents' | 'availability';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TeacherDetailPanel({ teacher, onClose }: { teacher: TeacherRow; onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('chat');
  const teacherId = teacher.id;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-slate-200 bg-white shadow-2xl lg:max-w-2xl flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label={`${teacher.display_name ?? 'Teacher'} details`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="avatar-md bg-emerald-50 text-emerald-600 shrink-0">
              {teacher.display_name?.charAt(0).toUpperCase() ?? '?'}
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate">{teacher.display_name ?? 'Teacher Details'}</h2>
              <p className="text-xs text-slate-400">ID: {teacherId.slice(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="btn-ghost rounded-lg p-2 shrink-0"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 pt-5 pb-2">
            <p className="text-sm text-slate-500">
              Private view for this teacher only — messages, documents, and availability are isolated.
            </p>
          </div>

          <div className="tabs px-6" role="tablist" aria-label="Teacher detail sections">
            {(['chat', 'documents', 'availability'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                type="button"
                onClick={() => setTab(t)}
                className={`tab capitalize ${tab === t ? 'tab-active' : ''}`}
              >
                {t === 'chat' && <MessageSquare className="h-3.5 w-3.5" />}
                {t === 'documents' && <FileText className="h-3.5 w-3.5" />}
                {t === 'availability' && <Calendar className="h-3.5 w-3.5" />}
                {t}
              </button>
            ))}
          </div>

          <div className="p-6">
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
    <div className="space-y-8">
      {error ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
      ) : null}

      <section>
        <div className="flex items-center gap-2 mb-4">
          <Upload className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">Uploaded by teacher</h3>
        </div>
        <ul className="space-y-2">
          {fromTeacher.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-400">No uploads from this teacher yet.</p>
            </li>
          ) : (
            fromTeacher.map((d) => (
              <li key={d.id} className="card flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{d.title}</p>
                    {d.created_at && (
                      <p className="text-xs text-slate-400">{new Date(d.created_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openDoc(d)}
                  className="btn-ghost btn-sm shrink-0"
                  aria-label={`Open ${d.title}`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <FileText className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-900">Shared with teacher</h3>
        </div>
        <ul className="space-y-2">
          {fromAdmin.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
              <p className="text-sm text-slate-400">No documents shared yet.</p>
            </li>
          ) : (
            fromAdmin.map((d) => (
              <li key={d.id} className="card flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{d.title}</p>
                    {d.assigned_at && (
                      <p className="text-xs text-slate-400">Shared {new Date(d.assigned_at).toLocaleDateString()}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => shareDocumentInChat(teacherId, d.storage_path, d.title, d.mime_type)}
                    className="btn-ghost btn-sm"
                    aria-label={`Send ${d.title} in chat`}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </button>
                  <button
                    type="button"
                    onClick={() => openDoc(d)}
                    className="btn-ghost btn-sm"
                    aria-label={`Open ${d.title}`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                </div>
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

  const kindIcon = (kind: string) => {
    switch (kind) {
      case 'recurring_weekly': return '🔄';
      case 'date_range': return '📅';
      default: return '📌';
    }
  };

  return (
    <div>
      <p className="mb-5 text-sm text-slate-500">
        View-only. Teachers manage their own availability in the mobile app.
      </p>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
          <Calendar className="h-8 w-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">No availability set.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="card px-4 py-3.5">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 text-sm">
                  {kindIcon(e.kind)}
                </div>
                <div className="min-w-0 flex-1">
                  {e.kind === 'recurring_weekly' ? (
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        Every {DAYS[e.day_of_week ?? 0]}
                      </p>
                      <p className="text-sm text-slate-600">
                        {e.start_time.slice(0, 5)} – {e.end_time.slice(0, 5)}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {e.start_date} → {e.end_date}
                      </p>
                      <p className="text-sm text-slate-600">
                        {e.start_time.slice(0, 5)} – {e.end_time.slice(0, 5)}
                      </p>
                    </div>
                  )}
                  {e.notes ? (
                    <p className="mt-1.5 text-xs text-slate-500 bg-slate-50 rounded-md px-2 py-1">{e.notes}</p>
                  ) : null}
                </div>
                <span className="badge-green shrink-0">{e.kind === 'recurring_weekly' ? 'Weekly' : 'Date Range'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
