import { supabase } from '../../../mobile/lib/supabase';
import { CoordinatorAssignment, Profile } from '../../../shared/types';

class CoordinatorService {
  /**
   * Assign a teacher or student to a coordinator
   */
  async assignToCoordinator(params: {
    coordinatorId: string;
    teacherId?: string;
    studentId?: string;
  }) {
    const { data, error } = await supabase
      .from('coordinator_assignments')
      .insert({
        coordinator_id: params.coordinatorId,
        teacher_id: params.teacherId,
        student_id: params.studentId,
      })
      .select()
      .single();

    if (error) throw error;
    return data as CoordinatorAssignment;
  }

  /**
   * Get all assignments for a coordinator
   */
  async getCoordinatorAssignments(coordinatorId: string) {
    const { data, error } = await supabase
      .from('coordinator_assignments')
      .select(`
        *,
        teacher:profiles!coordinator_assignments_teacher_id_fkey(id, display_name, role),
        student:profiles!coordinator_assignments_student_id_fkey(id, display_name, role)
      `)
      .eq('coordinator_id', coordinatorId);

    if (error) throw error;
    return data;
  }

  /**
   * Get all coordinators
   */
  async getCoordinators() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'coordinator');

    if (error) throw error;
    return data as Profile[];
  }

  /**
   * Remove an assignment
   */
  async removeAssignment(assignmentId: string) {
    const { error } = await supabase
      .from('coordinator_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;
  }
}

export const coordinatorService = new CoordinatorService();
