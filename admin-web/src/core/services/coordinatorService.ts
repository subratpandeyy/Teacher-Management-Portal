import { supabase } from '../../lib/supabase';
import type { CoordinatorAssignment, Profile, DailyReport } from '../../../../shared/types';

class CoordinatorService {
  async getCoordinators() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'coordinator')
      .is('deleted_at', null);

    if (error) throw error;
    return data as Profile[];
  }

  async getCoordinatorStats(coordinatorId: string) {
    const assignments = await this.getAssignments(coordinatorId);
    const teacherIds = assignments.map(a => a.teacher_id).filter(Boolean);
    const studentIds = assignments.map(a => a.student_id).filter(Boolean);

    return {
      teacherCount: teacherIds.length,
      studentCount: studentIds.length,
    };
  }

  async submitDailyReport(report: Omit<DailyReport, 'id' | 'created_at'>) {
    const { data, error } = await supabase
      .from('daily_reports')
      .upsert(report)
      .select()
      .single();

    if (error) throw error;
    return data as DailyReport;
  }

  async getDailyReports(coordinatorId?: string) {
    let query = supabase.from('daily_reports').select(`
      *,
      coordinator:profiles!daily_reports_coordinator_id_fkey(display_name)
    `);

    if (coordinatorId) {
      query = query.eq('coordinator_id', coordinatorId);
    }

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async assignToCoordinator(params: {
    coordinator_id: string;
    teacher_id?: string;
    student_id?: string;
  }) {
    const { data, error } = await supabase
      .from('coordinator_assignments')
      .insert(params)
      .select()
      .single();

    if (error) throw error;
    return data as CoordinatorAssignment;
  }

  async getAssignments(coordinatorId: string) {
    const { data: allAssignments, error } = await supabase
      .from('coordinator_assignments')
      .select(`
        *,
        teacher:profiles!coordinator_assignments_teacher_id_fkey(id, display_name, role),
        student:profiles!coordinator_assignments_student_id_fkey(id, display_name, role)
      `)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const activeTeacherAssign = new Map<string, any>();
    const activeStudentAssign = new Map<string, any>();

    for (const assign of allAssignments || []) {
      if (assign.teacher_id) {
        activeTeacherAssign.set(assign.teacher_id, assign);
      }
      if (assign.student_id) {
        activeStudentAssign.set(assign.student_id, assign);
      }
    }

    const activeAssignments = [
      ...Array.from(activeTeacherAssign.values()),
      ...Array.from(activeStudentAssign.values())
    ].filter(assign => assign.coordinator_id === coordinatorId);

    return activeAssignments;
  }
}

export const coordinatorService = new CoordinatorService();
