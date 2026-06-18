import { useState } from 'react';
import { TaskList } from '../features/tasks/TaskList';
import { TaskCreateForm } from '../features/tasks/TaskCreateForm';
import { Plus } from 'lucide-react';

export function TasksPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="page-container">
      <div className="page-header">
        <div className="flex flex-col gap-4 sm:flex-row mx-auto sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title">Task Management</h1>
            <p className="page-subtitle">Track and manage tasks across the platform.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary shrink-0"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
            New Task
          </button>
        </div>
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
