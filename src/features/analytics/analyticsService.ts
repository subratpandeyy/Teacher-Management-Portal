import { supabase } from '../../../mobile/lib/supabase';

class AnalyticsService {
  /**
   * Get Admin dashboard stats
   */
  async getAdminStats() {
    const [
      { count: totalStudents },
      { count: totalTeachers },
      { count: totalCoordinators },
      { count: activeGroups },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'teacher'),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'coordinator'),
      supabase.from('groups').select('*', { count: 'exact', head: true }),
    ]);

    // Attendance % (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('status')
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0]);

    const presentCount = attendanceData?.filter(a => a.status === 'present').length || 0;
    const totalAttendance = attendanceData?.length || 1;
    const attendancePercentage = (presentCount / totalAttendance) * 100;

    return {
      totalStudents: totalStudents || 0,
      totalTeachers: totalTeachers || 0,
      totalCoordinators: totalCoordinators || 0,
      activeGroups: activeGroups || 0,
      attendancePercentage: Math.round(attendancePercentage),
    };
  }

  /**
   * Get Coordinator dashboard stats
   */
  async getCoordinatorStats(coordinatorId: string) {
    const { data: assignments } = await supabase
      .from('coordinator_assignments')
      .select('teacher_id, student_id')
      .eq('coordinator_id', coordinatorId);

    const teacherIds = assignments?.map(a => a.teacher_id).filter(Boolean) || [];
    const studentIds = assignments?.map(a => a.student_id).filter(Boolean) || [];

    const { count: pendingTasks } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('assigned_by', coordinatorId)
      .eq('status', 'pending');

    return {
      assignedTeachers: teacherIds.length,
      assignedStudents: studentIds.length,
      pendingTasks: pendingTasks || 0,
    };
  }
}

export const analyticsService = new AnalyticsService();
