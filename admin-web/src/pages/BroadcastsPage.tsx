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
import { 
  Megaphone, 
  Send, 
  Users, 
  UserCheck, 
  GraduationCap, 
  Paperclip,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  MessageSquare,
  Info
} from 'lucide-react';

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
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const detailsSeq = useRef(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listTeachers().then(({ data }) => setTeachers((data as TeacherRow[]) ?? [])),
      fetchGroups().then(({ data }) => setGroups((data as GroupOption[]) ?? [])),
      loadBroadcasts()
    ]).finally(() => setLoading(false));
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

  if (loading) return (
    <div className="loading-page">
      <div className="spinner" aria-label="Loading broadcasts" />
    </div>
  );

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <h1 className="page-title">Broadcast Center</h1>
        <p className="page-subtitle">Send announcements and track delivery across all roles.</p>
      </div>

      {msg && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          msg.toLowerCase().includes('success') || msg.toLowerCase().includes('ok') 
            ? 'border-green-100 bg-green-50 text-green-700' 
            : 'border-rose-100 bg-rose-50 text-rose-700'
        }`} role="alert">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Compose Form */}
        <div className="lg:col-span-7">
          <form onSubmit={submit} className="card" aria-label="Compose broadcast announcement">
            <div className="card-header">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-blue-600">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Compose Announcement</h2>
                  <p className="text-xs text-slate-500">Create and send a new broadcast message</p>
                </div>
              </div>
            </div>
            <div className="card-body space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="target-type">Recipient Target</label>
                  <select
                    id="target-type"
                    className="select"
                    value={targetType}
                    onChange={(e) => setTargetType(e.target.value as BroadcastTargetType)}
                  >
                    <option value="all">Everyone</option>
                    <option value="teacher">Teachers</option>
                    <option value="coordinator">Coordinators</option>
                    <option value="student">Students</option>
                    <option value="group">Specific Group</option>
                    <option value="groups">Multiple Groups</option>
                  </select>
                </div>

                {targetType === 'group' && (
                  <div>
                    <label className="label" htmlFor="target-group">Select Group</label>
                    <select
                      id="target-group"
                      className="select"
                      value={targetGroupId}
                      onChange={(e) => setTargetGroupId(e.target.value)}
                      required
                    >
                      <option value="">Choose group...</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="label" htmlFor="announcement-title">Announcement Title</label>
                <input
                  id="announcement-title"
                  className="input"
                  placeholder="Important: Platform Maintenance"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <label className="label" htmlFor="announcement-message">Message Content</label>
                <textarea
                  id="announcement-message"
                  className="textarea min-h-[140px]"
                  placeholder="Write your message here..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <label className="label">Attachment (Optional)</label>
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-4">
                  <Paperclip className="h-5 w-5 text-slate-400 shrink-0" />
                  <input
                    type="file"
                    className="flex-1 text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-600 hover:file:bg-slate-50 file:shadow-sm file:border file:border-slate-200 file:cursor-pointer"
                    onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                    aria-label="Optional file attachment"
                  />
                  {attachment && (
                    <span className="badge-blue shrink-0">{attachment.name}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-400">
                  <Info className="h-3.5 w-3.5 inline mr-1" />
                  Recipients will be notified immediately
                </p>
                <button
                  type="submit"
                  disabled={sending}
                  className="btn-primary"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? 'Sending...' : 'Publish Announcement'}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* History & Feedback */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card" aria-label="Broadcast history">
            <div className="card-header">
              <h2 className="text-lg font-bold text-slate-900">Recent Broadcasts</h2>
            </div>
            <div className="card-body p-0">
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {broadcasts.length === 0 ? (
                  <div className="empty-state py-12">
                    <Clock className="empty-state-icon" />
                    <p className="empty-state-title">No history yet</p>
                    <p className="empty-state-desc">Sent broadcasts will appear here.</p>
                  </div>
                ) : (
                  broadcasts.map((b) => (
                    <div key={String(b.id)} className="px-6 py-4 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-slate-900 line-clamp-1">{String(b.title)}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="badge-slate text-[10px] capitalize">
                              Target: {String(b.target_type)}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {b.published_at ? new Date(String(b.published_at)).toLocaleDateString() : '—'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => loadDetails(String(b.id))}
                          className="btn-ghost btn-sm shrink-0"
                          aria-label={expandedId === b.id ? 'Hide details' : 'View details'}
                          aria-expanded={expandedId === b.id}
                        >
                          {expandedId === b.id ? (
                            <><ChevronUp className="h-3.5 w-3.5" /> Hide</>
                          ) : (
                            <><ChevronDown className="h-3.5 w-3.5" /> Details</>
                          )}
                        </button>
                      </div>

                      <p className="text-sm text-slate-600 line-clamp-2 mt-2">{String(b.message ?? b.body)}</p>

                      {b.attachment_name && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <Paperclip className="h-3 w-3 text-blue-500" />
                          <span className="text-xs text-blue-600 font-medium">{String(b.attachment_name)}</span>
                        </div>
                      )}

                      {expandedId === b.id && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="bg-slate-50 rounded-lg p-3 text-center">
                              <UserCheck className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                              <p className="text-xs text-slate-500 uppercase font-semibold">Read</p>
                              <p className="text-2xl font-bold text-slate-900 mt-0.5">{receipts.length}</p>
                            </div>
                            <div className="bg-slate-50 rounded-lg p-3 text-center">
                              <MessageSquare className="h-4 w-4 mx-auto text-blue-600 mb-1" />
                              <p className="text-xs text-slate-500 uppercase font-semibold">Feedback</p>
                              <p className="text-2xl font-bold text-slate-900 mt-0.5">{feedback.length}</p>
                            </div>
                          </div>
                          
                          {feedback.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Feedback</p>
                              <div className="space-y-2">
                                {feedback.slice(0, 3).map((f: any) => (
                                  <div key={f.id} className="rounded-lg bg-white border border-slate-100 p-3">
                                    <p className="text-sm font-semibold text-slate-700">{f.profiles?.display_name}</p>
                                    <p className="text-sm text-slate-500 mt-1">{f.feedback_text}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {feedback.length === 0 && receipts.length === 0 && (
                            <p className="text-xs text-slate-400 italic text-center">No engagement data yet.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
