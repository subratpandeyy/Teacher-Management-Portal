import { useEffect, useState } from 'react';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  fetchGroupMembers,
  fetchGroups,
  listTeachers,
  removeGroupMember,
  updateGroup,
} from '../lib/features';
import type { Group } from '../lib/features';
import type { TeacherRow } from '../lib/supabase';

export function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; teacher_id: string; display_name: string }[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [addTeacherId, setAddTeacherId] = useState('');
  const [msg, setMsg] = useState('');

  const selected = groups.find((g) => g.id === selectedGroupId) ?? null;

  async function loadGroups() {
    const { data } = await fetchGroups();
    setGroups((data as Group[]) ?? []);
  }

  async function loadMembers(groupId: string) {
    const { data } = await fetchGroupMembers(groupId);
    const mapped = (data ?? []).map((row: Record<string, unknown>) => {
      const p = row.profiles as { display_name: string | null } | { display_name: string | null }[] | null;
      const profile = Array.isArray(p) ? p[0] : p;
      return {
        id: String(row.id),
        teacher_id: String(row.teacher_id),
        display_name: profile?.display_name ?? 'Teacher',
      };
    });
    setMembers(mapped);
  }

  useEffect(() => {
    loadGroups();
    listTeachers().then(({ data }) => setTeachers((data as TeacherRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (selectedGroupId) loadMembers(selectedGroupId);
  }, [selectedGroupId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await createGroup(name, description || null);
    setMsg(error ? error.message : 'Group created.');
    setName('');
    setDescription('');
    await loadGroups();
  }

  async function handleUpdate() {
    if (!selected) return;
    await updateGroup(selected.id, selected.name, selected.description);
    await loadGroups();
    setMsg('Group updated.');
  }

  async function handleDelete() {
    if (!selected || !confirm('Delete this group?')) return;
    await deleteGroup(selected.id);
    setSelectedGroupId(null);
    await loadGroups();
    setMsg('Group deleted.');
  }

  async function handleAddMember() {
    if (!selectedGroupId || !addTeacherId) return;
    const { error } = await addGroupMember(selectedGroupId, addTeacherId);
    setMsg(error ? error.message : 'Member added.');
    setAddTeacherId('');
    await loadMembers(selectedGroupId);
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="gc-page-title">Teacher Groups</h2>
        <p className="gc-page-subtitle">Organize teachers into groups for broadcasts and document sharing.</p>
      </div>
      {msg ? <p className="rounded-xl border border-green-100 bg-green-50 px-3 py-2 text-sm text-green-800">{msg}</p> : null}

      <form onSubmit={handleCreate} className="gc-card max-w-md space-y-3 p-5">
        <h3 className="font-semibold text-slate-900">Create group</h3>
        <input className="gc-input" placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} required />
        <textarea className="gc-input" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        <button type="submit" className="gc-btn-primary">Create</button>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        <ul className="gc-card divide-y overflow-hidden">
          {groups.map((g) => (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => setSelectedGroupId(g.id)}
                className={`w-full px-4 py-3 text-left transition hover:bg-green-50/50 ${selectedGroupId === g.id ? 'border-l-4 border-l-green-500 bg-gradient-to-r from-green-50 to-blue-50/30' : ''}`}
              >
                <div className="font-medium">{g.name}</div>
                {g.description ? <div className="text-xs text-slate-500">{g.description}</div> : null}
              </button>
            </li>
          ))}
        </ul>

        {selected ? (
          <div className="gc-card p-5">
            <input
              className="gc-input mb-2 font-semibold"
              value={selected.name}
              onChange={(e) =>
                setGroups((prev) =>
                  prev.map((g) => (g.id === selected.id ? { ...g, name: e.target.value } : g))
                )
              }
            />
            <textarea
              className="mb-3 w-full rounded border px-3 py-2 text-sm"
              value={selected.description ?? ''}
              onChange={(e) =>
                setGroups((prev) =>
                  prev.map((g) => (g.id === selected.id ? { ...g, description: e.target.value } : g))
                )
              }
            />
            <div className="mb-4 flex gap-2">
              <button type="button" onClick={handleUpdate} className="gc-btn-primary text-sm">Save</button>
              <button type="button" onClick={handleDelete} className="gc-btn-secondary border-red-200 text-sm text-red-600">Delete</button>
            </div>

            <h4 className="mb-2 font-medium">Members</h4>
            <div className="mb-2 flex gap-2">
              <select className="flex-1 rounded border px-2 py-1 text-sm" value={addTeacherId} onChange={(e) => setAddTeacherId(e.target.value)}>
                <option value="">Add teacher…</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.display_name}</option>
                ))}
              </select>
              <button type="button" onClick={handleAddMember} className="rounded bg-slate-800 px-3 py-1 text-sm text-white">Add</button>
            </div>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex justify-between rounded bg-slate-50 px-2 py-1">
                  <span>{m.display_name}</span>
                  <button type="button" className="text-red-600" onClick={() => removeGroupMember(selected.id, m.teacher_id).then(() => loadMembers(selected.id))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-slate-500">Select a group to manage members.</p>
        )}
      </div>
    </div>
  );
}
