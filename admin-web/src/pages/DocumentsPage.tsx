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
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listTeachers().then(({ data }) => setTeachers((data as TeacherRow[]) ?? []));
    fetchGroups().then(({ data }) => setGroups((data as { id: string; name: string }[]) ?? []));
    void loadAll();
  }, []);

  async function loadAll() {
    await Promise.all([loadDeliveries(), loadTeacherUploads()]);
  }

  async function loadDeliveries() {
    const { data } = await fetchDocumentDeliveries();
    const rows: DeliveryRow[] = [];
    for (const d of (data ?? []) as Record<string, unknown>[]) {
      const doc = d.documents as Record<string, unknown> | Record<string, unknown>[] | null;
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
    const result = await openDocumentInBrowser(doc);
    if (!result.ok) setMessage(result.error);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Document Sharing</h2>
        <p className="mt-1 text-sm text-slate-600">
          Share files with teachers and open documents teachers send you.
        </p>
      </div>

      <form onSubmit={handleUpload} className="max-w-xl space-y-4 rounded-xl border bg-white p-6">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFilesChange(e.target.files)}
        />
        <button
          type="button"
          onClick={handleSelectFilesClick}
          className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          Select document(s)
        </button>
        {files?.length ? (
          <p className="text-xs text-slate-600">
            {Array.from(files)
              .map((f) => f.name)
              .join(', ')}
          </p>
        ) : null}
        <select
          className="w-full rounded border px-3 py-2 text-sm"
          value={targetType}
          onChange={(e) => setTargetType(e.target.value as DocumentTargetType)}
        >
          <option value="all">All teachers</option>
          <option value="group">Single group</option>
          <option value="groups">Multiple groups</option>
          <option value="teacher">Selected teachers</option>
        </select>
        {targetType === 'group' ? (
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={targetGroupId}
            onChange={(e) => setTargetGroupId(e.target.value)}
            required
          >
            <option value="">Choose group…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
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
          <div className="max-h-40 overflow-y-auto rounded border p-2 text-sm">
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
        ) : null}
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload & assign'}
        </button>
        {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      </form>

      <div>
        <h3 className="font-semibold">From teachers</h3>
        <ul className="mt-2 divide-y rounded-xl border bg-white text-sm">
          {teacherUploads.length === 0 ? (
            <li className="px-4 py-6 text-center text-slate-500">No teacher uploads yet.</li>
          ) : (
            teacherUploads.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 px-4 py-3">
                <div>
                  <div className="font-medium">{row.title}</div>
                  <div className="text-slate-500">
                    from {row.teacherName} · {new Date(row.created_at).toLocaleString()}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-blue-600"
                  onClick={() => handleOpen(row)}
                >
                  Open
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h3 className="font-semibold">Deliveries to teachers</h3>
        <ul className="mt-2 divide-y rounded-xl border bg-white text-sm">
          {deliveries.length === 0 ? (
            <li className="px-4 py-6 text-center text-slate-500">No deliveries yet.</li>
          ) : (
            deliveries.map((row) => (
              <li key={row.id} className="flex justify-between gap-4 px-4 py-3">
                <div>
                  <div className="font-medium">{row.title}</div>
                  <div className="text-slate-500">→ {row.teacherName}</div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-blue-600"
                  onClick={() => handleOpen(row)}
                >
                  Open
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
