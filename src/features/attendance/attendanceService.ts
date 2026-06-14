import { supabase } from '../../../mobile/lib/supabase';
import { Attendance, AttendanceStatus } from '../../../shared/types';

class AttendanceService {
  /**
   * Mark attendance for a student
   */
  async markAttendance(params: {
    studentId: string;
    teacherId: string;
    groupId?: string;
    status: AttendanceStatus;
    date?: string;
  }) {
    const { data, error } = await supabase
      .from('attendance')
      .upsert({
        student_id: params.studentId,
        teacher_id: params.teacherId,
        group_id: params.groupId,
        status: params.status,
        date: params.date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single();

    if (error) throw error;
    return data as Attendance;
  }

  /**
   * Get attendance for a group on a specific date
   */
  async getGroupAttendance(groupId: string, date: string) {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        *,
        student:profiles!attendance_student_id_fkey(display_name)
      `)
      .eq('group_id', groupId)
      .eq('date', date);

    if (error) throw error;
    return data;
  }

  /**
   * Get attendance for a specific student
   */
  async getStudentAttendance(studentId: string) {
    const { data, error } = await supabase
      .from('attendance')
      .select(`
        *,
        teacher:profiles!attendance_teacher_id_fkey(display_name)
      `)
      .eq('student_id', studentId)
      .order('date', { ascending: false });

    if (error) throw error;
    return data;
  }
}

export const attendanceService = new AttendanceService();
