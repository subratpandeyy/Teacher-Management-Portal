import { useEffect, useState, type FormEvent } from 'react';
import {
  adminUploadDocument,
  fetchDocumentDeliveries,
  fetchGroups,
  getSignedUrl,
  listTeachers,
} from '../lib/features';
import type { DocumentTargetType } from '../../../shared/types';
import type { TeacherRow } from '../lib/supabase';

export function DocumentsPage() {
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, unknown>[]>([]);
  const [targetType, setTargetType] = useState<DocumentTargetType>('all');
  const [targetGroupId, setTargetGroupId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [files, setFiles] = useState<FileList | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    listTeachers().then(({ data }) => setTeachers((data as TeacherRow[]) ?? []));
    fetchGroups().then(({ data }) => setGroups((data as { id: string; name: string }[]) ?? []));
    loadDeliveries();
  }, []);

  async function loadDeliveries() {
    const { data } = await fetchDocumentDeliveries();
    setDeliveries((data as Record<string, unknown>[]) ?? []);
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!files?.length) return;

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
    for (const file of Array.from(files)) {
      const { error } = await adminUploadDocument(file, {
        targetType,
        targetId: targetType === 'group' ? targetGroupId || null : null,
        teacherIds: targetType === 'teacher' ? selectedTeacherIds : undefined,
        groupIds: targetType === 'groups' ? selectedGroupIds : undefined,
      });
      if (error) fail++;
      else ok++;
    }

    if (fail && ok === 0) {
      setMessage('Upload failed. Check storage permissions and try again.');
    } else {
      setMessage(fail ? `${ok} uploaded, ${fail} failed.` : `Shared ${ok} file(s).`);
    }
    setUploading(false);
    setFiles(null);
    await loadDeliveries();
  }

  async function openDoc(path: string) {
    const { data } = await getSignedUrl(path);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Document Sharing</h2>
        <p className="mt-1 text-sm text-slate-600">
          Teachers can view assigned documents only. Assign to all, one group, multiple groups, or selected teachers.
        </p>
      </div>

      <form onSubmit={handleUpload} className="max-w-xl space-y-4 rounded-xl border bg-white p-6">
        <input type="file" multiple className="block w-full text-sm" onChange={(e) => setFiles(e.target.files)} />
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
        <button type="submit" disabled={uploading} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {uploading ? 'Uploading…' : 'Upload & assign'}
        </button>
        {message ? <p className="text-sm">{message}</p> : null}
      </form>

      <div>
        <h3 className="font-semibold">Deliveries</h3>
        <ul className="mt-2 divide-y rounded-xl border bg-white text-sm">
          {deliveries.length === 0 ? (
            <li className="px-4 py-6 text-center text-slate-500">No deliveries yet.</li>
          ) : (
            deliveries.map((d) => {
              const doc = d.documents as { title?: string; storage_path?: string } | { title?: string; storage_path?: string }[] | null;
              const row = Array.isArray(doc) ? doc[0] : doc;
              const teacher = d.profiles as { display_name?: string } | null;
              return (
                <li key={String(d.id)} className="flex justify-between px-4 py-3">
                  <div>
                    <div className="font-medium">{row?.title ?? 'Document'}</div>
                    <div className="text-slate-500">→ {teacher?.display_name ?? String(d.teacher_id)}</div>
                  </div>
                  {row?.storage_path ? (
                    <button type="button" className="text-blue-600" onClick={() => openDoc(row.storage_path!)}>
                      Open
                    </button>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
