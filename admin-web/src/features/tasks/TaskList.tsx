import { useEffect, useState } from 'react';
import { taskService } from '../../core/services/taskService';
import type { Task, TaskStatus } from '../../../../shared/types';
import { Clock, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react';

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

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
    // Optimistic UI update
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
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await taskService.deleteTask(taskId);
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="animate-spin text-green-600" /></div>;

  return (
    <div className="space-y-4">
      {tasks.length === 0 ? (
        <p className="text-center py-8 text-slate-500">No tasks found.</p>
      ) : (
        tasks.map((task) => (
          <div key={task.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className={`rounded-full p-2 ${
                task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                task.status === 'overdue' ? 'bg-rose-50 text-rose-600' :
                'bg-amber-50 text-amber-600'
              }`}>
                {task.status === 'completed' ? <CheckCircle2 className="h-5 w-5" /> :
                 task.status === 'overdue' ? <AlertCircle className="h-5 w-5" /> :
                 <Clock className="h-5 w-5" />}
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">{task.title}</h4>
                <p className="text-sm text-slate-500">{task.description}</p>
                <p className="mt-1 text-xs text-slate-400">
                  Assigned to {(task as any).assigned_to_profile?.display_name ?? 'Unknown'}
                  {(task as any).assigned_by_profile?.display_name
                    ? ` · by ${(task as any).assigned_by_profile.display_name}`
                    : ''}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <select
                value={task.status}
                onChange={(e) => handleStatusUpdate(task.id, e.target.value as TaskStatus)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-sm focus:outline-none"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="overdue">Overdue</option>
              </select>
              <button
                type="button"
                onClick={() => handleDeleteTask(task.id)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-rose-600 transition-colors"
              >
                <Trash2 className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
