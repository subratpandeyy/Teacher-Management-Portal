import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  adminUploadDocument,
  fetchAllTeacherUploadsForAdmin,
  fetchDocumentDeliveries,
  fetchGroups,
  listTeachers,
} from '../lib/features';
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
  ExternalLink
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
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
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
        const [{ data: teacherData }, { data: groupData }] = await Promise.all([
          listTeachers(),
          fetchGroups(),
        ]);
        setTeachers((teacherData as TeacherRow[]) ?? []);
        setGroups((groupData as { id: string; name: string }[]) ?? []);
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
    console.log('[DocumentsPage] Select files button clicked');
    fileInputRef.current?.click();
  }

  function handleFilesChange(list: FileList | null) {
    console.log('[DocumentsPage] files chosen:', list?.length ?? 0);
    setFiles(list);
    if (list?.length) {
      setMessage(`Selected ${list.length} file(s). Click Upload & assign to continue.`);
    }
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    console.log('[DocumentsPage] Upload form submit');

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
      setMessage('Select at least one teacher.');
      return;
    }

    setUploading(true);
    setMessage('');

    let ok = 0;
    let fail = 0;
    let lastError = '';

    for (const file of Array.from(files)) {
      console.log('[DocumentsPage] uploading', file.name);
      const { error } = await adminUploadDocument(file, {
        targetType,
        targetId: targetType === 'group' ? targetGroupId || null : null,
        teacherIds: targetType === 'teacher' ? selectedTeacherIds : undefined,
        groupIds: targetType === 'groups' ? selectedGroupIds : undefined,
      });
      if (error) {
        fail++;
        lastError = error;
        console.error('[DocumentsPage] upload failed', error);
      } else {
        ok++;
        console.log('[DocumentsPage] upload ok', file.name);
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
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-green-600" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Materials & Library</h2>
          <p className="text-slate-500">Distribute materials to teachers and manage uploads.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Upload Form */}
        <div className="lg:col-span-4">
          <form onSubmit={handleUpload} className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-50 pb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                <Upload className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Upload Material</h3>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Distribution Target</label>
              <select
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-blue-500 focus:outline-none"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as DocumentTargetType)}
              >
                <option value="all">Everyone</option>
                <option value="teacher">Specific Teachers</option>
                <option value="group">Specific Group</option>
                <option value="groups">Multiple Groups</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">Select Files</label>
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 cursor-pointer hover:bg-slate-50 transition-colors"
              >
                <FileText className="h-8 w-8 text-slate-400" />
                <p className="text-xs font-medium text-slate-500">Click to browse or drag and drop</p>
                {files && <p className="text-xs font-bold text-blue-600">{files.length} files selected</p>}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFilesChange(e.target.files)}
                />
              </div>
            </div>

            <div className="space-y-2">
              {message && (
                <p className={`text-xs font-medium ${message.toLowerCase().includes('success') ? 'text-green-600' : 'text-rose-600'}`}>
                  {message}
                </p>
              )}
              <button
                type="submit"
                disabled={uploading || !files}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-bold text-white transition-all hover:bg-blue-700 disabled:opacity-50"
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
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Sent Materials</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Document Title</th>
                    <th className="px-6 py-3">Sent To</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {deliveries.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No sent materials</td></tr>
                  ) : (
                    deliveries.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-blue-500" />
                            <span className="font-medium text-slate-700 line-clamp-1">{d.title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{d.teacherName}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleOpen(d)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
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
          <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Teacher Submissions</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/50 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-6 py-3">Document</th>
                    <th className="px-6 py-3">From Teacher</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {teacherUploads.length === 0 ? (
                    <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-400">No submissions yet</td></tr>
                  ) : (
                    teacherUploads.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <FileText className="h-4 w-4 text-emerald-500" />
                            <span className="font-medium text-slate-700 line-clamp-1">{u.title}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{u.teacherName}</td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => handleOpen(u)}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
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
