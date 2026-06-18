import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  adminUploadDocument,
  fetchAllTeacherUploadsForAdmin,
  fetchDocumentDeliveries,
  fetchGroups,
  listTeachers,
} from '../lib/features';
import { supabase } from '../lib/supabase';
import { openDocumentInBrowser } from '../lib/openDocument';
import type { DocumentTargetType } from '../../../shared/types';
import type { TeacherRow } from '../lib/supabase';
import { 
  FileText, 
  Upload, 
  Users, 
  UserCheck, 
  GraduationCap, 
  Search, 
  Loader2, 
  Eye, 
  Trash2,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info
} from 'lucide-react';

type DeliveryRow = {
  id: string;
  teacherName: string;
  title: string;
  storage_path: string;
  storage_bucket: string | null;
  mime_type: string | null;
};

type TeacherUploadRow = {
  id: string;
  title: string;
  storage_path: string;
  storage_bucket: string | null;
  mime_type: string | null;
  teacherName: string;
  created_at: string;
};

export function DocumentsPage() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; display_name: string | null; role: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupMembers, setGroupMembers] = useState<{ group_id: string; teacher_id: string }[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [teacherUploads, setTeacherUploads] = useState<TeacherUploadRow[]>([]);
  const [targetType, setTargetType] = useState<DocumentTargetType>('all');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [{ data: teacherData }, { data: groupData }, { data: userData }, { data: memberData }] = await Promise.all([
          listTeachers(),
          fetchGroups(),
          supabase.from('profiles').select('id, display_name, role').is('deleted_at', null).neq('role', 'admin').order('display_name'),
          supabase.from('group_members').select('group_id, teacher_id'),
        ]);
        setTeachers((teacherData as TeacherRow[]) ?? []);
        setGroups((groupData as { id: string; name: string }[]) ?? []);
        setAllUsers((userData as { id: string; display_name: string | null; role: string }[]) ?? []);
        setGroupMembers((memberData as { group_id: string; teacher_id: string }[]) ?? []);
        await loadAll();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadAll() {
    await Promise.all([loadDeliveries(), loadTeacherUploads()]);
  }

  async function loadDeliveries() {
    const { data } = await fetchDocumentDeliveries();
    const rows: DeliveryRow[] = [];
    for (const d of (data ?? []) as any[]) {
      const doc = d.documents as any;
      const row = Array.isArray(doc) ? doc[0] : doc;
      if (!row?.storage_path) continue;
      const teacher = d.profiles as { display_name?: string } | null;
      rows.push({
        id: String(d.id),
        teacherName: teacher?.display_name ?? String(d.teacher_id),
        title: String(row.title ?? row.file_name ?? 'Document'),
        storage_path: String(row.storage_path),
        storage_bucket: (row.storage_bucket as string | null) ?? null,
        mime_type: (row.mime_type as string | null) ?? null,
      });
    }
    setDeliveries(rows);
  }

  async function loadTeacherUploads() {
    const { data } = await fetchAllTeacherUploadsForAdmin();
    setTeacherUploads(
      ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const teacher = row.profiles as { display_name?: string } | null;
        return {
          id: String(row.id),
          title: String(row.title ?? row.file_name ?? 'Document'),
          storage_path: String(row.storage_path),
          storage_bucket: (row.storage_bucket as string | null) ?? null,
          mime_type: (row.mime_type as string | null) ?? null,
          teacherName: teacher?.display_name ?? String(row.teacher_id),
          created_at: String(row.created_at),
        };
      })
    );
  }

  function handleSelectFilesClick() {
    fileInputRef.current?.click();
  }

  function handleFilesChange(list: FileList | null) {
    setFiles(list);
    if (list?.length) {
      setMessage(`Selected ${list.length} file(s). Click Upload & assign to continue.`);
    }
  }

  const getResolvedRecipients = () => {
    if (targetType === 'all') {
      return allUsers;
    }
    if (targetType === 'student') {
      return allUsers.filter(u => u.role === 'student');
    }
    if (targetType === 'coordinator') {
      return allUsers.filter(u => u.role === 'coordinator');
    }
    if (targetType === 'teacher_role') {
      return allUsers.filter(u => u.role === 'teacher');
    }
    if (targetType === 'teacher') {
      return allUsers.filter(u => selectedTeacherIds.includes(u.id));
    }
    if (targetType === 'group') {
      const memberIds = groupMembers.filter(m => m.group_id === targetGroupId).map(m => m.teacher_id);
      return allUsers.filter(u => memberIds.includes(u.id));
    }
    if (targetType === 'groups') {
      const memberIds = groupMembers.filter(m => selectedGroupIds.includes(m.group_id)).map(m => m.teacher_id);
      return allUsers.filter(u => memberIds.includes(u.id));
    }
    return [];
  };

  async function handleUpload(e: FormEvent) {
    e.preventDefault();

    if (!files?.length) {
      setMessage('Select at least one file first.');
      return;
    }

    if (targetType === 'group' && !targetGroupId) {
      setMessage('Choose a group.');
      return;
    }
    if (targetType === 'groups' && selectedGroupIds.length === 0) {
      setMessage('Select at least one group.');
      return;
    }
    if (targetType === 'teacher' && selectedTeacherIds.length === 0) {
      setMessage('Select at least one recipient.');
      return;
    }

    if (getResolvedRecipients().length === 0) {
      setMessage('No recipients matched the selected target.');
      return;
    }

    setUploading(true);
    setMessage('');

    let ok = 0;
    let fail = 0;
    let lastError = '';

    for (const file of Array.from(files)) {
      const { error } = await adminUploadDocument(file, {
        targetType,
        targetId: targetType === 'group' ? targetGroupId || null : null,
        teacherIds: targetType === 'teacher' ? selectedTeacherIds : undefined,
        groupIds: targetType === 'groups' ? selectedGroupIds : undefined,
      });
      if (error) {
        fail++;
        lastError = error;
      } else {
        ok++;
      }
    }

    setUploading(false);

    if (fail && ok === 0) {
      setMessage(lastError || 'Upload failed. Check storage permissions and try again.');
    } else {
      setMessage(fail ? `${ok} uploaded, ${fail} failed. ${lastError}` : `Shared ${ok} file(s).`);
    }

    setFiles(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await loadAll();
  }

  async function handleOpen(doc: {
    storage_path: string;
    storage_bucket?: string | null;
    mime_type?: string | null;
  }) {
    setMessage('');
    const result = await openDocumentInBrowser(doc);
    if (result.ok === false) setMessage(result.error);
  }

  if (loading) return (
    <div className="loading-page">
      <div className="spinner" aria-label="Loading documents" />
    </div>
  );

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <h1 className="page-title">Materials & Library</h1>
        <p className="page-subtitle">Distribute materials to teachers and manage uploads.</p>
      </div>

      {message && (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          message.toLowerCase().includes('success') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('uploaded') || message.toLowerCase().includes('shared')
            ? 'border-green-100 bg-green-50 text-green-700' 
            : 'border-rose-100 bg-rose-50 text-rose-700'
        }`} role="alert">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upload Form */}
        <div className="lg:col-span-4">
          <form onSubmit={handleUpload} className="card" aria-label="Upload materials form">
            <div className="card-header">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Upload Material</h2>
                  <p className="text-xs text-slate-500">Share documents with your organization</p>
                </div>
              </div>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label className="label" htmlFor="doc-target-type">Distribution Target</label>
                <select
                  id="doc-target-type"
                  className="select"
                  value={targetType}
                  onChange={(e) => {
                    setTargetType(e.target.value as DocumentTargetType);
                    setSelectedTeacherIds([]);
                    setSelectedGroupIds([]);
                    setTargetGroupId('');
                  }}
                >
                  <option value="all">Everyone (organization)</option>
                  <option value="teacher">Specific users (multi-select)</option>
                  <option value="student">All students</option>
                  <option value="coordinator">All coordinators</option>
                  <option value="teacher_role">All teachers</option>
                  <option value="group">Single group</option>
                  <option value="groups">Multiple groups</option>
                </select>
              </div>

              {targetType === 'teacher' ? (
                <div>
                  <label className="label" htmlFor="user-search">Recipients</label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="user-search"
                      type="text"
                      placeholder="Search users..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="input pl-9"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1 bg-white">
                    {allUsers
                      .filter((u) => u.display_name?.toLowerCase().includes(search.toLowerCase()))
                      .map((u) => (
                        <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedTeacherIds.includes(u.id)}
                            onChange={(e) => {
                              setSelectedTeacherIds((prev) =>
                                e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id)
                              );
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-green-500"
                          />
                          <span className="flex-1">{u.display_name ?? 'User'}</span>
                          <span className="text-xs text-slate-400">{u.role}</span>
                        </label>
                      ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{selectedTeacherIds.length} selected</p>
                </div>
              ) : null}

              {targetType === 'group' ? (
                <div>
                  <label className="label" htmlFor="doc-group-single">Group</label>
                  <select
                    id="doc-group-single"
                    value={targetGroupId}
                    onChange={(e) => setTargetGroupId(e.target.value)}
                    className="select"
                  >
                    <option value="">Select group...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {targetType === 'groups' ? (
                <div>
                  <label className="label">Groups</label>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-200 p-2 space-y-1 bg-white">
                    {groups.map((g) => (
                      <label key={g.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer text-sm">
                        <input
                          type="checkbox"
                          checked={selectedGroupIds.includes(g.id)}
                          onChange={(e) => {
                            setSelectedGroupIds((prev) =>
                              e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)
                            );
                          }}
                          className="rounded border-slate-300 text-blue-600 focus:ring-green-500"
                        />
                        {g.name}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{selectedGroupIds.length} groups selected</p>
                </div>
              ) : null}

              {(targetType === 'all' || targetType === 'student' || targetType === 'coordinator' || targetType === 'teacher_role') ? (
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5">
                  <p className="text-xs text-blue-700 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    Materials will be sent to:{' '}
                    {targetType === 'all' ? 'all users in the organization' :
                     targetType === 'student' ? 'all students' :
                     targetType === 'coordinator' ? 'all coordinators' : 'all teachers'}
                  </p>
                </div>
              ) : null}

              {/* Recipient Preview */}
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Recipient Preview ({getResolvedRecipients().length})
                </p>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-2 space-y-1">
                  {getResolvedRecipients().length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No recipients resolved.</p>
                  ) : (
                    getResolvedRecipients().map(u => (
                      <div key={u.id} className="text-xs text-slate-600 flex justify-between px-1">
                        <span className="font-medium truncate">{u.display_name ?? 'User'}</span>
                        <span className="shrink-0 ml-2">
                          {u.role === 'admin' ? <span className="role-admin text-[10px]">admin</span> :
                           u.role === 'coordinator' ? <span className="role-coordinator text-[10px]">coordinator</span> :
                           u.role === 'teacher' ? <span className="role-teacher text-[10px]">teacher</span> :
                           <span className="role-student text-[10px]">student</span>}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div>
                <label className="label">Select Files</label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 cursor-pointer hover:bg-slate-100 transition-colors"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelectFilesClick(); }}
                  aria-label="Click to select files"
                >
                  <FileText className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">Click to browse or drag and drop</p>
                  <p className="text-xs text-slate-400">Supported: PDF, Word, Excel, Images</p>
                  {files && <p className="badge-blue">{files.length} files selected</p>}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFilesChange(e.target.files)}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading || !files}
                className="btn-primary w-full"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Uploading...' : 'Start Upload'}
              </button>
            </div>
          </form>
        </div>

        {/* Material Lists */}
        <div className="lg:col-span-8 space-y-6">
          {/* Admin Deliveries */}
          <div className="table-wrap" aria-label="Sent materials">
            <div className="card-header">
              <h2 className="text-lg font-bold text-slate-900">Sent Materials</h2>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Document Title</th>
                    <th>Sent To</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center">
                        <div className="empty-state py-4">
                          <FileText className="empty-state-icon" />
                          <p className="empty-state-title">No sent materials</p>
                          <p className="empty-state-desc">Upload and distribute materials from the form.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    deliveries.map((d) => (
                      <tr key={d.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                              <FileText className="h-4 w-4" />
                            </div>
                            <span className="font-medium text-slate-700 line-clamp-1">{d.title}</span>
                          </div>
                        </td>
                        <td className="text-slate-500">{d.teacherName}</td>
                        <td className="text-right">
                          <button
                            onClick={() => handleOpen(d)}
                            className="btn-ghost btn-sm"
                            aria-label={`Open ${d.title}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Teacher Uploads */}
          <div className="table-wrap" aria-label="Teacher submissions">
            <div className="card-header">
              <h2 className="text-lg font-bold text-slate-900">Teacher Submissions</h2>
            </div>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>From Teacher</th>
                    <th>Submitted</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {teacherUploads.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center">
                        <div className="empty-state py-4">
                          <Upload className="empty-state-icon" />
                          <p className="empty-state-title">No submissions yet</p>
                          <p className="empty-state-desc">Teacher uploads will appear here.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    teacherUploads.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                              <FileText className="h-4 w-4" />
                            </div>
                            <span className="font-medium text-slate-700 line-clamp-1">{u.title}</span>
                          </div>
                        </td>
                        <td className="text-slate-500">{u.teacherName}</td>
                        <td className="text-slate-400 text-xs">
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="text-right">
                          <button
                            onClick={() => handleOpen(u)}
                            className="btn-ghost btn-sm"
                            aria-label={`Open ${u.title}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
