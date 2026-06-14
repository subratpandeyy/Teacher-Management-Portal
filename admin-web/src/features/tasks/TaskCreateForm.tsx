import { useEffect, useState, type FormEvent } from 'react';
import { taskService } from '../../core/services/taskService';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../core/auth/AuthContext';
import type { TaskPriority, UserRole } from '../../../../shared/types';
import { Loader2, X } from 'lucide-react';

interface TaskCreateFormProps {
  onClose: () => void;
  onCreated: () => void;
}

type Assignee = { id: string; display_name: string | null; role: UserRole };

export function TaskCreateForm({ onClose, onCreated }: TaskCreateFormProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadAssignees() {
      const roles: UserRole[] =
        profile?.role === 'coordinator'
          ? ['teacher']
          : ['coordinator', 'teacher', 'student'];

      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, role')
        .in('role', roles)
        .is('deleted_at', null)
        .order('display_name');

      setAssignees((data as Assignee[]) ?? []);
      if (data?.length) setAssignedTo(data[0].id);
    }

    void loadAssignees();
  }, [profile?.role]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile || !title.trim() || !assignedTo) return;

    setLoading(true);
    setError('');

    try {
      await taskService.createTask({
        title: title.trim(),
        description: description.trim() || null,
        assigned_to: assignedTo,
        assigned_by: profile.id,
        status: 'pending',
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">New Task</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Assign to</label>
            <select
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
            >
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name ?? 'User'} ({a.role})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
