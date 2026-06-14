import { supabase } from '../../../mobile/lib/supabase';
import { StudentProgress } from '../../../shared/types';

class ProgressService {
  /**
   * Update student progress
   */
  async updateProgress(params: {
    studentId: string;
    teacherId: string;
    subject: string;
    completionPercentage: number;
    remarks?: string;
  }) {
    const { data, error } = await supabase
      .from('student_progress')
      .upsert({
        student_id: params.studentId,
        teacher_id: params.teacherId,
        subject: params.subject,
        completion_percentage: params.completionPercentage,
        remarks: params.remarks,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data as StudentProgress;
  }

  /**
   * Get progress for a student
   */
  async getStudentProgress(studentId: string) {
    const { data, error } = await supabase
      .from('student_progress')
      .select(`
        *,
        teacher:profiles!student_progress_teacher_id_fkey(display_name)
      `)
      .eq('student_id', studentId);

    if (error) throw error;
    return data;
  }

  /**
   * Get all student progress for a teacher
   */
  async getTeacherStudentsProgress(teacherId: string) {
    const { data, error } = await supabase
      .from('student_progress')
      .select(`
        *,
        student:profiles!student_progress_student_id_fkey(display_name)
      `)
      .eq('teacher_id', teacherId);

    if (error) throw error;
    return data;
  }
}

export const progressService = new ProgressService();
