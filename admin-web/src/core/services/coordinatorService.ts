import { supabase } from '../../lib/supabase';
import type { CoordinatorAssignment, DailyReport, Profile } from '../../../../shared/types';

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
    const teacherIds = [...new Set(assignments.map(a => a.teacher_id).filter(Boolean))];
    const studentIds = [...new Set(assignments.map(a => a.student_id).filter(Boolean))];

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
    const targetId = params.teacher_id ?? params.student_id;
    const targetColumn = params.teacher_id ? 'teacher_id' : 'student_id';
    if (!targetId) throw new Error('Must provide teacher_id or student_id');

    const { data: existing } = await supabase
      .from('coordinator_assignments')
      .select('id, coordinator_id')
      .eq(targetColumn, targetId);

    if (existing && existing.length > 0) {
      const first = existing[0];
      if (first.coordinator_id === params.coordinator_id) {
        throw new Error('Already assigned to this coordinator');
      }
      const { error: delErr } = await supabase
        .from('coordinator_assignments')
        .delete()
        .eq(targetColumn, targetId);
      if (delErr) throw delErr;
    }

    const { data, error } = await supabase
      .from('coordinator_assignments')
      .insert(params)
      .select()
      .single();

    if (error) throw error;
    return data as CoordinatorAssignment;
  }

  async removeAssignment(assignmentId: string) {
    const { error } = await supabase
      .from('coordinator_assignments')
      .delete()
      .eq('id', assignmentId);
    if (error) throw error;
  }

  async getAssignments(coordinatorId?: string) {
    let query = supabase
      .from('coordinator_assignments')
      .select(`
        *,
        teacher:profiles!coordinator_assignments_teacher_id_fkey(id, display_name, role),
        student:profiles!coordinator_assignments_student_id_fkey(id, display_name, role)
      `);

    if (coordinatorId) {
      query = query.eq('coordinator_id', coordinatorId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }

  async getUnassignedTeachers() {
    const { data: assignedTeacherIds } = await supabase
      .from('coordinator_assignments')
      .select('teacher_id')
      .not('teacher_id', 'is', null);

    const excludedIds = assignedTeacherIds?.map(a => a.teacher_id).filter(Boolean) ?? [];

    const query = supabase
      .from('profiles')
      .select('*')
      .eq('role', 'teacher')
      .is('deleted_at', null);

    if (excludedIds.length > 0) {
      query.not('id', 'in', `(${excludedIds.join(',')})`);
    }

    const { data, error } = await query.order('display_name');
    if (error) throw error;
    return data as Profile[];
  }

  async getUnassignedStudents() {
    const { data: assignedStudentIds } = await supabase
      .from('coordinator_assignments')
      .select('student_id')
      .not('student_id', 'is', null);

    const excludedIds = assignedStudentIds?.map(a => a.student_id).filter(Boolean) ?? [];

    const query = supabase
      .from('profiles')
      .select('*')
      .eq('role', 'student')
      .is('deleted_at', null);

    if (excludedIds.length > 0) {
      query.not('id', 'in', `(${excludedIds.join(',')})`);
    }

    const { data, error } = await query.order('display_name');
    if (error) throw error;
    return data as Profile[];
  }
}

export const coordinatorService = new CoordinatorService();
