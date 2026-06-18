import { useEffect, useState, type ReactNode } from 'react';
import { taskService } from '../../core/services/taskService';
import type { Task, TaskStatus } from '../../../../shared/types';
import { Clock, CheckCircle2, AlertCircle, Loader2, Trash2, AlertTriangle, ClipboardCheck } from 'lucide-react';

const statusBadge: Record<TaskStatus, string> = {
  pending: 'badge-amber',
  in_progress: 'badge-blue',
  completed: 'badge-green',
  overdue: 'badge-rose',
};

const statusIcon: Record<TaskStatus, ReactNode> = {
  pending: <Clock className="h-5 w-5" aria-hidden="true" />,
  in_progress: <Clock className="h-5 w-5" aria-hidden="true" />,
  completed: <CheckCircle2 className="h-5 w-5" aria-hidden="true" />,
  overdue: <AlertCircle className="h-5 w-5" aria-hidden="true" />,
};

const statusIconBg: Record<TaskStatus, string> = {
  pending: 'bg-amber-50 text-amber-600',
  in_progress: 'bg-blue-50 text-blue-600',
  completed: 'bg-emerald-50 text-emerald-600',
  overdue: 'bg-rose-50 text-rose-600',
};

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    try {
      const data = await taskService.getTasks();
      setTasks(data as any);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleStatusUpdate = async (taskId: string, newStatus: TaskStatus) => {
    const previousTasks = [...tasks];
    setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      await taskService.updateTaskStatus(taskId, newStatus);
    } catch (err) {
      console.error('Error updating task status:', err);
      setTasks(previousTasks);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setDeleteTarget(null);
    try {
      await taskService.deleteTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  if (loading) {
    return (
      <div className="loading-page">
        <Loader2 className="spinner" aria-label="Loading tasks" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ClipboardCheck className="h-12 w-12" />
            </div>
            <h3 className="empty-state-title">No tasks found</h3>
            <p className="empty-state-desc">Create a new task to get started.</p>
          </div>
        ) : (
          tasks.map((task) => {
            const badgeClass = statusBadge[task.status] ?? 'badge-slate';
            return (
              <div key={task.id} className="card">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-4 min-w-0 flex-1">
                    <div className={`mt-0.5 shrink-0 rounded-lg p-2 ${statusIconBg[task.status] ?? 'bg-slate-50 text-slate-500'}`}>
                      {statusIcon[task.status] ?? <Clock className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-slate-900 break-words">{task.title}</h4>
                        <span className={badgeClass}>{task.status.replace('_', ' ')}</span>
                      </div>
                      {task.description && (
                        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{task.description}</p>
                      )}
                      <p className="mt-1.5 text-xs text-slate-400">
                        {(task as any).assigned_to_profile?.display_name
                          ? `Assigned to ${(task as any).assigned_to_profile.display_name}`
                          : 'Unassigned'}
                        {(task as any).assigned_by_profile?.display_name
                          ? ` · by ${(task as any).assigned_by_profile.display_name}`
                          : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 w-full sm:w-auto">
                    <select
                      value={task.status}
                      onChange={(e) => handleStatusUpdate(task.id, e.target.value as TaskStatus)}
                      className="select py-1.5 text-xs flex-1 sm:flex-none"
                      aria-label={`Change status for ${task.title}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="overdue">Overdue</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(task.id)}
                      className="btn-ghost rounded-lg p-2 text-slate-400 hover:text-rose-600"
                      aria-label={`Delete task: ${task.title}`}
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {deleteTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-title"
        >
          <div className="modal max-w-sm">
            <div className="modal-body text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                <AlertTriangle className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 id="confirm-delete-title" className="text-lg font-bold text-slate-900">
                Delete Task
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Are you sure you want to delete this task? This action cannot be undone.
              </p>
            </div>
            <div className="modal-footer justify-center gap-3 flex-col sm:flex-row">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="btn-secondary w-full sm:w-auto"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteTask(deleteTarget)}
                className="btn-danger w-full sm:w-auto"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
