import { useState } from 'react';
import { TaskList } from '../features/tasks/TaskList';
import { TaskCreateForm } from '../features/tasks/TaskCreateForm';
import { Plus } from 'lucide-react';

export function TasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Task Management</h2>
          <p className="text-slate-500">Track and manage tasks across the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700"
        >
          <Plus className="h-5 w-5" />
          New Task
        </button>
      </div>

      <TaskList key={refreshKey} />

      {showCreate ? (
        <TaskCreateForm
          onClose={() => setShowCreate(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      ) : null}
    </div>
  );
}
