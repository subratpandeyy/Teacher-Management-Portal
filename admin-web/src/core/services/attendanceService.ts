import { supabase } from '../../lib/supabase';
import type { Attendance, AttendanceStatus } from '../../../../shared/types';

class AttendanceService {
  async markAttendance(params: {
    studentId: string;
    teacherId: string;
    groupId?: string;
    status: AttendanceStatus;
    date?: string;
  }) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert(
        {
          student_id: params.studentId,
          teacher_id: params.teacherId,
          group_id: params.groupId,
          status: params.status,
          date: params.date || new Date().toISOString().split('T')[0],
        },
        { onConflict: 'student_id,date' }
      )
      .select()
      .single();

    if (error) throw error;
    return data as Attendance;
  }

  async getAttendance(filters: { groupId?: string; studentId?: string; date?: string }) {
    let query = supabase.from('attendance').select(`
      *,
      student:profiles!attendance_student_id_fkey(display_name),
      teacher:profiles!attendance_teacher_id_fkey(display_name),
      group:groups(name)
    `);

    if (filters.groupId) query = query.eq('group_id', filters.groupId);
    if (filters.studentId) query = query.eq('student_id', filters.studentId);
    if (filters.date) query = query.eq('date', filters.date);

    const { data, error } = await query.order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async bulkMarkAttendance(records: Omit<Attendance, 'id' | 'created_at'>[]) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert(records, { onConflict: 'student_id,date' })
      .select();

    if (error) throw error;
    return data;
  }
}

export const attendanceService = new AttendanceService();
