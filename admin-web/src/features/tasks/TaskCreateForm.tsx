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
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <div className="modal max-w-lg">
        <div className="modal-header">
          <h3 id="task-modal-title" className="modal-title">New Task</h3>
          <button type="button" onClick={onClose} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="mx-6 mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit}>
          <div className="modal-body space-y-5">
            <div>
              <label className="label" htmlFor="task-title">
                Title <span className="text-rose-500">*</span>
              </label>
              <input
                id="task-title"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="input"
                placeholder="Enter task title"
                aria-required="true"
              />
            </div>

            <div>
              <label className="label" htmlFor="task-desc">
                Description
              </label>
              <textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="textarea"
                placeholder="Optional description..."
              />
            </div>

            <div>
              <label className="label" htmlFor="task-assignee">
                Assign to <span className="text-rose-500">*</span>
              </label>
              <select
                id="task-assignee"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="select"
                aria-required="true"
              >
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name ?? 'User'} ({a.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="task-priority">
                  Priority
                </label>
                <select
                  id="task-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="select"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="task-due">
                  Due date
                </label>
                <input
                  id="task-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div className="modal-footer flex-col gap-2 sm:flex-row">
            <button type="button" onClick={onClose} className="btn-secondary w-full sm:w-auto">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full sm:w-auto"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {loading ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
