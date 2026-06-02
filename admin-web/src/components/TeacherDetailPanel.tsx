import { useEffect, useState, type FormEvent } from 'react';
import type { TeacherRow } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import {
  fetchAdminDocumentsForTeacher,
  fetchConversationMessages,
  fetchTeacherAvailability,
  getTeacherConversation,
  sendAdminChatMessage,
  softDeleteChatMessage,
  updateChatMessage,
  uploadChatAttachment,
  fetchTeacherUploadsForAdmin,
  shareDocumentInChat,
  getSignedUrl,
} from '../lib/features';
import { openDocumentInBrowser } from '../lib/openDocument';
import { STORAGE_BUCKETS } from '../../../shared/storage';

type Tab = 'chat' | 'documents' | 'availability';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function TeacherDetailPanel({ teacher }: { teacher: TeacherRow }) {
  const [tab, setTab] = useState<Tab>('chat');
  const teacherId = teacher.id;

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900">{teacher.display_name ?? 'Teacher'}</h2>
      <p className="text-sm text-slate-500">
        Private view for this teacher only — messages, documents, and availability are isolated.
      </p>

      <div className="mt-4 flex gap-2">
        {(['chat', 'documents', 'availability'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
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
                <span>{d.title}</span>
                <button
                  type="button"
                  onClick={() => openDoc(d)}
                  className="text-sm text-blue-600"
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
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
                <span>{d.title}</span>
                <span className="flex gap-3">
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
                <div className="font-medium">
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

type ChatRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
};

function ChatTab({ teacherId }: { teacherId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [adminId, setAdminId] = useState<string | null>(null);

  const loadMessages = async (convId: string) => {
    const { data, error: msgErr } = await fetchConversationMessages(convId, teacherId);
    if (msgErr) setError(msgErr.message);
    else setMessages((data as ChatRow[]) ?? []);
  };

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (user.user) setAdminId(user.user.id);

      const { data: conv, error: convErr } = await getTeacherConversation(teacherId);
      if (convErr || !conv) {
        setError(convErr?.message ?? 'No conversation');
        return;
      }
      setConversationId(conv.id);
      await loadMessages(conv.id);

      channel = supabase
        .channel(`admin-chat:${conv.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conv.id}` },
          () => loadMessages(conv.id)
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [teacherId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim() || !adminId) return;

    if (editingId) {
      const { error: err } = await updateChatMessage(editingId, text.trim());
      if (err) setError(err.message);
      else {
        setEditingId(null);
        setText('');
        await loadMessages(conversationId);
      }
      return;
    }

    const { error: sendErr } = await sendAdminChatMessage(
      conversationId,
      adminId,
      teacherId,
      text.trim()
    );
    if (sendErr) setError(sendErr);
    else setText('');
  }

  async function attachFile(file: File) {
    if (!conversationId || !adminId) return;
    const up = await uploadChatAttachment(conversationId, file);
    if (up.error || !up.path) {
      setError(up.error ?? 'Upload failed');
      return;
    }
    await sendAdminChatMessage(conversationId, adminId, teacherId, `📎 ${file.name}`, {
      url: up.path,
      name: file.name,
      type: up.mimeType,
    });
    await loadMessages(conversationId);
  }

  return (
    <div className="max-w-2xl">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="mb-4 max-h-80 overflow-y-auto rounded-xl shadow-sm bg-white p-4">
          {messages.map((m) => {
            const isAdmin = m.sender_id === adminId;

            return (
              <div
                key={m.id}
                className={`mb-3 flex ${
                  isAdmin ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`group max-w-[75%] rounded-xl px-4 py-3 shadow-sm ${
                    isAdmin
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <span
                      className={`text-xs font-semibold ${
                        isAdmin ? 'text-blue-400' : 'text-slate-700'
                      }`}
                    >
                      {isAdmin ? 'Admin' : 'Teacher'}
                    </span>

                    <span
                      className={`text-xs ${
                        isAdmin ? 'text-blue-400' : 'text-slate-800'
                      }`}
                    >
                      {new Date(m.created_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <p
                    className={
                      m.deleted_at
                        ? 'italic opacity-70'
                        : ''
                    }
                  >
                    {m.deleted_at
                      ? 'Message deleted'
                      : m.body}
                  </p>

                  {m.attachment_url && !m.deleted_at ? (
                    <button
                      type="button"
                      className={`mt-2 block text-xs underline ${
                        isAdmin
                          ? 'text-blue-100'
                          : 'text-blue-600'
                      }`}
                      onClick={() => {
                        void getSignedUrl(
                          m.attachment_url!,
                          STORAGE_BUCKETS.chatFiles
                        ).then(({ data }) => {
                          if (data?.signedUrl) {
                            window.open(data.signedUrl);
                          }
                        });
                      }}
                    >
                      📎 {m.attachment_name ?? 'Attachment'}
                    </button>
                  ) : null}

                  {!m.deleted_at && isAdmin ? (
                    <div className="mt-2 flex gap-3 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        className="text-xs text-blue-100"
                        onClick={() => {
                          setEditingId(m.id);
                          setText(m.body);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="text-xs text-red-200"
                        onClick={() => {
                          void softDeleteChatMessage(m.id).then(() => {
                            if (conversationId) {
                              void loadMessages(conversationId);
                            }
                          });
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

      {editingId ? <p className="mb-2 text-xs text-blue-600">Editing message</p> : null}
      <form onSubmit={send} className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply to teacher…"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
          {editingId ? 'Save' : 'Send'}
        </button>
      </form>
      <input
        type="file"
        className="mt-2 text-xs"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) attachFile(f);
        }}
      />
    </div>
  );
}
