import { supabase } from '../../lib/supabase';
import type { Task, TaskStatus, TaskPriority } from '../../../../shared/types';

class TaskService {
  async getTasks(filters?: { assigned_to?: string; assigned_by?: string; status?: TaskStatus }) {
    let query = supabase.from('tasks').select(`
      *,
      assigned_to_profile:profiles!tasks_assigned_to_fkey(display_name, role),
      assigned_by_profile:profiles!tasks_assigned_by_fkey(display_name, role)
    `);

    if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to);
    if (filters?.assigned_by) query = query.eq('assigned_by', filters.assigned_by);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>) {
    const { data, error } = await supabase
      .from('tasks')
      .insert(task)
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw error;
    return data as Task;
  }

  async deleteTask(taskId: string) {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) throw error;
  }
}

export const taskService = new TaskService();
