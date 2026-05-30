import { useEffect, useState, type FormEvent } from 'react';
import type { TeacherRow } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import {
  fetchConversationMessages,
  fetchTeacherDocuments,
  fetchTeacherInbox,
  getSignedUrl,
  getTeacherConversation,
  sendAdminChatMessage,
  sendInboxToTeacher,
} from '../lib/api';

type Tab = 'inbox' | 'documents' | 'chat';

export function TeacherDetailPanel({ teacher }: { teacher: TeacherRow }) {
  const [tab, setTab] = useState<Tab>('inbox');
  const teacherId = teacher.id;

  return (
    <div>
      <h2 className="text-lg font-bold">{teacher.display_name ?? 'Teacher'}</h2>
      <p className="text-sm text-slate-500">
        Viewing only data for teacher ID <code className="text-xs">{teacherId}</code>
      </p>

      <div className="mt-4 flex gap-2">
        {(['inbox', 'documents', 'chat'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
              tab === t ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'inbox' ? <InboxTab teacherId={teacherId} /> : null}
        {tab === 'documents' ? <DocumentsTab teacherId={teacherId} /> : null}
        {tab === 'chat' ? <ChatTab teacherId={teacherId} /> : null}
      </div>
    </div>
  );
}

function InboxTab({ teacherId }: { teacherId: string }) {
  const [items, setItems] = useState<
    { id: string; subject: string; body: string; is_read: boolean; created_at: string }[]
  >([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const { data, error: err } = await fetchTeacherInbox(teacherId);
    if (err) setError(err.message);
    else setItems(data ?? []);
  }

  useEffect(() => {
    load();
  }, [teacherId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const { error: err } = await sendInboxToTeacher(teacherId, subject, body);
    if (err) setError(err.message);
    else {
      setSubject('');
      setBody('');
      await load();
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={send} className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="font-semibold">Send inbox message</h3>
        <input
          className="mt-3 w-full rounded border px-3 py-2 text-sm"
          placeholder="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
        <textarea
          className="mt-2 w-full rounded border px-3 py-2 text-sm"
          placeholder="Body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <button type="submit" className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
          Send to this teacher only
        </button>
      </form>
      <div>
        {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
        <ul className="space-y-2">
          {items.map((m) => (
            <li key={m.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="font-medium">{m.subject}</div>
              <p className="mt-1 text-sm text-slate-600">{m.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function DocumentsTab({ teacherId }: { teacherId: string }) {
  const [docs, setDocs] = useState<
    { id: string; title: string; storage_path: string; created_at: string }[]
  >([]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTeacherDocuments(teacherId).then(({ data, error: err }) => {
      if (err) setError(err.message);
      else setDocs(data ?? []);
    });
  }, [teacherId]);

  async function openDoc(path: string) {
    const { data, error: err } = await getSignedUrl(path, teacherId);
    if (err || !data?.signedUrl) {
      setError(err?.message ?? 'Failed to sign URL');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <ul className="mt-2 space-y-2">
        {docs.map((d) => (
          <li key={d.id} className="flex items-center justify-between rounded-lg border bg-white p-3">
            <span>{d.title}</span>
            <button
              type="button"
              onClick={() => openDoc(d.storage_path)}
              className="text-sm text-blue-600"
            >
              Open (signed URL)
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChatTab({ teacherId }: { teacherId: string }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    { id: string; sender_id: string; body: string; created_at: string }[]
  >([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data: conv, error: convErr } = await getTeacherConversation(teacherId);
      if (convErr || !conv) {
        setError(convErr?.message ?? 'No conversation');
        return;
      }
      setConversationId(conv.id);

      const { data, error: msgErr } = await fetchConversationMessages(conv.id, teacherId);
      if (msgErr) setError(msgErr.message);
      else setMessages(data ?? []);

      channel = supabase
        .channel(`admin-chat:${conv.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `conversation_id=eq.${conv.id}`,
          },
          (payload) => {
            const row = payload.new as (typeof messages)[0];
            setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          }
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [teacherId]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim()) return;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { error: sendErr } = await sendAdminChatMessage(
      conversationId,
      user.user.id,
      teacherId,
      text.trim()
    );
    if (sendErr) setError(sendErr);
    else setText('');
  }

  return (
    <div className="max-w-xl">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="mb-4 max-h-80 overflow-y-auto rounded-xl border bg-white p-4">
        {messages.map((m) => (
          <div key={m.id} className="mb-2 text-sm">
            <span className="text-slate-400">{new Date(m.created_at).toLocaleTimeString()}</span>
            <p>{m.body}</p>
          </div>
        ))}
      </div>
      <form onSubmit={send} className="flex gap-2">
        <input
          className="flex-1 rounded border px-3 py-2 text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Reply to teacher…"
        />
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">
          Send
        </button>
      </form>
    </div>
  );
}
