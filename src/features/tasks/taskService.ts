import { supabase } from '../../../mobile/lib/supabase';
import { Task, TaskStatus, TaskPriority } from '../../../shared/types';

class TaskService {
  /**
   * Create a new task
   */
  async createTask(params: {
    title: string;
    description?: string;
    assignedTo: string;
    priority?: TaskPriority;
    dueDate?: string;
  }) {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: params.title,
        description: params.description,
        assigned_to: params.assignedTo,
        assigned_by: userData.user.id,
        priority: params.priority || 'medium',
        due_date: params.dueDate,
      })
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  }

  /**
   * Update task status
   */
  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const { error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) throw error;
  }

  /**
   * Get tasks assigned to current user
   */
  async getMyTasks() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('assigned_to', userData.user.id)
      .order('due_date', { ascending: true });

    if (error) throw error;
    return data as Task[];
  }

  /**
   * Get tasks created by current user
   */
  async getCreatedTasks() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('tasks')
      .select(`
        *,
        assigned_to_profile:profiles!tasks_assigned_to_fkey(display_name, role)
      `)
      .eq('assigned_by', userData.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
}

export const taskService = new TaskService();
