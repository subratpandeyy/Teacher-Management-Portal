import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  fetchBroadcastAttachments,
  fetchBroadcastFeedback,
  fetchBroadcastReadReceipts,
  fetchBroadcasts,
  fetchGroups,
  listTeachers,
  sendBroadcastWithOptionalAttachment,
} from '../lib/features';
import type { BroadcastTargetType } from '../../../shared/types';
import type { TeacherRow } from '../lib/supabase';

type GroupOption = { id: string; name: string };

export function BroadcastsPage() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetType, setTargetType] = useState<BroadcastTargetType>('all');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [singleTeacherId, setSingleTeacherId] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [broadcasts, setBroadcasts] = useState<Record<string, unknown>[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, unknown>[]>([]);
  const [feedback, setFeedback] = useState<Record<string, unknown>[]>([]);
  const [attachments, setAttachments] = useState<Record<string, unknown>[]>([]);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const detailsSeq = useRef(0);

  useEffect(() => {
    listTeachers().then(({ data }) => setTeachers((data as TeacherRow[]) ?? []));
    fetchGroups().then(({ data }) => setGroups((data as GroupOption[]) ?? []));
    loadBroadcasts();
  }, []);

  async function loadBroadcasts() {
    const { data } = await fetchBroadcasts();
    setBroadcasts((data as Record<string, unknown>[]) ?? []);
  }

  async function loadDetails(broadcastId: string) {
    if (expandedId === broadcastId) {
      setExpandedId(null);
      setReceipts([]);
      setFeedback([]);
      setAttachments([]);
      return;
    }

    setExpandedId(broadcastId);
    setReceipts([]);
    setFeedback([]);
    setAttachments([]);

    const seq = ++detailsSeq.current;
    const [r, f, a] = await Promise.all([
      fetchBroadcastReadReceipts(broadcastId),
      fetchBroadcastFeedback(broadcastId),
      fetchBroadcastAttachments(broadcastId),
    ]);

    if (seq !== detailsSeq.current) return;

    setReceipts((r.data as Record<string, unknown>[]) ?? []);
    setFeedback((f.data as Record<string, unknown>[]) ?? []);
    setAttachments((a.data as Record<string, unknown>[]) ?? []);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg('');

    const teacherIds =
      targetType === 'teacher'
        ? singleTeacherId
          ? [singleTeacherId]
          : selectedTeacherIds
        : undefined;

    const groupIds = targetType === 'groups' ? selectedGroupIds : undefined;

    const result = await sendBroadcastWithOptionalAttachment({
      title,
      message,
      targetType,
      targetId: targetType === 'group' ? targetGroupId || null : null,
      teacherIds,
      groupIds,
      attachment,
    });

    setSending(false);

    if (result.error) {
      setMsg(result.error);
      if (result.broadcastId) await loadBroadcasts();
      return;
    }

    setMsg('Broadcast sent successfully.');
    setTitle('');
    setMessage('');
    setAttachment(null);
    setSelectedTeacherIds([]);
    setSelectedGroupIds([]);
    setSingleTeacherId('');
    await loadBroadcasts();
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="gc-page-title">Broadcasts</h2>
        <p className="gc-page-subtitle">
          Send to all teachers, one group, multiple groups, or selected teachers. Attachments upload to Storage and link via broadcast_attachments.
        </p>
      </div>

      <form onSubmit={submit} className="gc-card max-w-xl space-y-4 p-6">
        <div>
          <label className="text-sm font-medium">Send to</label>
          <select
            className="mt-1 w-full rounded border px-3 py-2 text-sm"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as BroadcastTargetType)}
          >
            <option value="all">All teachers ({teachers.length})</option>
            <option value="group">Single group</option>
            <option value="groups">Multiple groups</option>
            <option value="teacher">Teacher(s)</option>
          </select>
        </div>

        {targetType === 'group' ? (
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={targetGroupId}
            onChange={(e) => setTargetGroupId(e.target.value)}
            required
          >
            <option value="">Choose group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        ) : null}

        {targetType === 'groups' ? (
          <div className="max-h-40 overflow-y-auto rounded border p-2 text-sm">
            {groups.map((g) => (
              <label key={g.id} className="flex gap-2 py-1">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.includes(g.id)}
                  onChange={(e) =>
                    setSelectedGroupIds((prev) =>
                      e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                    )
                  }
                />
                {g.name}
              </label>
            ))}
          </div>
        ) : null}

        {targetType === 'teacher' ? (
          <>
            <select
              className="w-full rounded border px-3 py-2 text-sm"
              value={singleTeacherId}
              onChange={(e) => setSingleTeacherId(e.target.value)}
            >
              <option value="">Or pick one teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.display_name}</option>
              ))}
            </select>
            <div className="max-h-40 overflow-y-auto rounded border p-2 text-sm">
              <p className="mb-1 text-xs text-slate-500">Or select multiple:</p>
              {teachers.map((t) => (
                <label key={t.id} className="flex gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={selectedTeacherIds.includes(t.id)}
                    onChange={(e) =>
                      setSelectedTeacherIds((prev) =>
                        e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                      )
                    }
                  />
                  {t.display_name}
                </label>
              ))}
            </div>
          </>
        ) : null}

        <input className="w-full rounded border px-3 py-2 text-sm" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <textarea className="w-full rounded border px-3 py-2 text-sm" rows={5} placeholder="Message" value={message} onChange={(e) => setMessage(e.target.value)} required />
        <input type="file" className="text-sm" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
        <button type="submit" disabled={sending} className="gc-btn-primary disabled:opacity-50">
          {sending ? 'Sending…' : 'Send broadcast'}
        </button>
        {msg ? <p className="text-sm">{msg}</p> : null}
      </form>

      <div>
        <h3 className="font-semibold">Sent broadcasts</h3>
        <ul className="gc-card mt-2 divide-y overflow-hidden">
          {broadcasts.map((b) => (
            <li key={String(b.id)} className="px-4 py-3 text-sm">
              <div className="flex justify-between gap-4">
                <div>
                  <div className="font-medium">{String(b.title)}</div>
                  <p className="text-slate-600">{String(b.message ?? b.body)}</p>
                  <div className="mt-1 text-xs text-slate-400">
                    Target: {String(b.target_type)} · {b.published_at ? new Date(String(b.published_at)).toLocaleString() : '—'}
                    {b.attachment_name ? ` · 📎 ${String(b.attachment_name)}` : ''}
                  </div>
                </div>
                <button type="button" className="text-blue-600 shrink-0" onClick={() => loadDetails(String(b.id))}>
                  {expandedId === b.id ? 'Hide' : 'Details'}
                </button>
              </div>
              {expandedId === b.id ? (
                <div className="mt-3 space-y-3">
                  {attachments.length > 0 ? (
                    <div>
                      <h4 className="font-medium text-xs uppercase text-slate-500">Attachments</h4>
                      <ul className="mt-1 space-y-1 text-xs">
                        {attachments.map((att) => (
                          <li key={String(att.id)}>📎 {String(att.file_name)}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium text-xs uppercase text-slate-500">Read receipts</h4>
                    <ul className="mt-1 space-y-1 text-xs">
                      {receipts.map((r) => (
                        <li key={String(r.id)} className="flex justify-between">
                          <span>{String((r.profiles as { display_name?: string })?.display_name ?? r.teacher_id)}</span>
                          <span>{r.read_at ? 'Read' : 'Unread'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-xs uppercase text-slate-500">Feedback</h4>
                    <ul className="mt-1 space-y-2 text-xs">
                      {feedback.length === 0 ? <li className="text-slate-400">No feedback yet</li> : null}
                      {feedback.map((f) => (
                        <li key={String(f.id)} className="rounded bg-slate-50 p-2">
                          <div className="font-medium">{(f.profiles as { display_name?: string })?.display_name}</div>
                          <p>{String(f.feedback_text)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
