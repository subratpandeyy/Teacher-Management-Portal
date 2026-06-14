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
  MessageSquare
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
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Broadcast Center</h2>
          <p className="text-slate-500">Send announcements and track delivery across all roles.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Compose Form */}
        <div className="lg:col-span-7">
          <form onSubmit={submit} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600">
                <Megaphone className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Compose Announcement</h3>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700">Recipient Target</label>
                <select
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
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
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Select Group</label>
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
                    value={targetGroupId}
                    onChange={(e) => setTargetGroupId(e.target.value)}
                    required
                  >
                    <option value="">Choose group…</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Announcement Title</label>
              <input
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-green-500 focus:outline-none"
                placeholder="Important: Platform Maintenance"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Message Content</label>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:border-green-500 focus:outline-none resize-none"
                rows={6}
                placeholder="Write your message here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Attachment (Optional)</label>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 p-4">
                <Paperclip className="h-5 w-5 text-slate-400" />
                <input
                  type="file"
                  className="flex-1 text-xs text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-slate-600 hover:file:bg-slate-200"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 pt-2">
              {msg && (
                <p className={`text-xs font-medium ${msg.toLowerCase().includes('success') ? 'text-green-600' : 'text-rose-600'}`}>
                  {msg}
                </p>
              )}
              <button
                type="submit"
                disabled={sending}
                className="ml-auto flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 font-bold text-white transition-all hover:bg-green-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending...' : 'Publish Announcement'}
              </button>
            </div>
          </form>
        </div>

        {/* History & Feedback */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Recent Broadcasts</h3>
            <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
              {broadcasts.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Clock className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No history yet</p>
                </div>
              ) : (
                broadcasts.map((b) => (
                  <div key={String(b.id)} className="rounded-xl border border-slate-50 bg-slate-50/50 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-slate-900 line-clamp-1">{String(b.title)}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          Target: {String(b.target_type)}
                        </p>
                      </div>
                      <button
                        onClick={() => loadDetails(String(b.id))}
                        className="text-blue-600 text-xs font-bold hover:underline"
                      >
                        {expandedId === b.id ? 'HIDE' : 'DETAILS'}
                      </button>
                    </div>

                    <p className="text-sm text-slate-600 line-clamp-2">{String(b.message ?? b.body)}</p>

                    <div className="flex items-center justify-between pt-2 text-[10px] text-slate-400 border-t border-slate-100">
                      <span>{b.published_at ? new Date(String(b.published_at)).toLocaleString() : '—'}</span>
                      {b.attachment_name && <span className="flex items-center gap-1 text-blue-600"><Paperclip className="h-2.5 w-2.5" /> ATTACHED</span>}
                    </div>

                    {expandedId === b.id && (
                      <div className="mt-4 pt-4 border-t border-slate-200 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white rounded-lg p-2 text-center">
                            <p className="text-xs text-slate-400 uppercase">Read</p>
                            <p className="text-lg font-bold text-slate-900">{receipts.length}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 text-center">
                            <p className="text-xs text-slate-400 uppercase">Feedback</p>
                            <p className="text-lg font-bold text-slate-900">{feedback.length}</p>
                          </div>
                        </div>
                        
                        {feedback.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Feedback</p>
                            {feedback.slice(0, 3).map((f: any) => (
                              <div key={f.id} className="bg-white rounded-lg p-2 text-xs border border-slate-100">
                                <p className="font-bold text-slate-700">{f.profiles?.display_name}</p>
                                <p className="text-slate-500 mt-1">{f.feedback_text}</p>
                              </div>
                            ))}
                          </div>
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
  );
}
