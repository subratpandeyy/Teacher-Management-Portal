import { supabase } from '../../lib/supabase';
import type { UserRole, Profile } from '../../../../shared/types';

class UserService {
  /**
   * Get all users with optional filtering
   */
  async getUsers(filters?: { role?: UserRole; search?: string }) {
    let query = supabase.from('profiles').select('*').is('deleted_at', null);

    if (filters?.role) {
      query = query.eq('role', filters.role);
    }

    if (filters?.search) {
      query = query.ilike('display_name', `%${filters.search}%`);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return data as Profile[];
  }

  /**
   * Get students with their assigned coordinator and teacher
   */
  async getStudentsWithAssignments() {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        assignments:coordinator_assignments!coordinator_assignments_student_id_fkey(
          id,
          created_at,
          coordinator:profiles!coordinator_assignments_coordinator_id_fkey(id, display_name),
          teacher:profiles!coordinator_assignments_teacher_id_fkey(id, display_name)
        )
      `)
      .eq('role', 'student')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Get teachers with their assigned coordinator
   */
  async getTeachersWithAssignments() {
    const { data, error } = await supabase
      .from('profiles')
      .select(`
        *,
        assignments:coordinator_assignments!coordinator_assignments_teacher_id_fkey(
          id,
          created_at,
          coordinator:profiles!coordinator_assignments_coordinator_id_fkey(id, display_name)
        )
      `)
      .eq('role', 'teacher')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  /**
   * Create a new user (Note: Admin usually creates users via Auth API or a custom edge function)
   * This implementation assumes a secure backend environment or authorized admin
   */
  async createUser(params: {
    email: string;
    role: UserRole;
    displayName: string;
    phone?: string;
    status?: string;
    password?: string;
  }) {
    const tempPassword =
      params.password ??
      `Gc!${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const { data, error } = await supabase.auth.signUp({
      email: params.email,
      password: tempPassword,
      options: {
        data: {
          display_name: params.displayName,
          role: params.role,
          phone: params.phone,
          status: params.status || 'active',
        },
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('User creation failed');

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profileError) throw profileError;
    return profile as Profile;
  }

  /**
   * Update user role or display name
   */
  async updateUser(userId: string, updates: Partial<Profile>) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  }

  /**
   * Soft delete a user profile
   */
  async deleteUser(userId: string) {
    const { error } = await supabase
      .from('profiles')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', userId);
    if (error) throw error;
  }

  /**
   * Hard delete a user from auth.users (admin function)
   */
  async hardDeleteUser(userId: string) {
    const { error } = await supabase.rpc('delete_user_by_admin', { p_user_id: userId });
    if (error) throw error;
  }

  /**
   * Get all teacher-student assignments
   */
  async getTeacherStudentAssignments() {
    const { data, error } = await supabase
      .from('teacher_student_assignments')
      .select(`
        id,
        teacher_id,
        student_id,
        assigned_by,
        assigned_by_role,
        created_at,
        teacher:profiles!teacher_student_assignments_teacher_id_fkey(id, display_name),
        student:profiles!teacher_student_assignments_student_id_fkey(id, display_name)
      `);
    if (error) throw error;
    return data;
  }

  /**
   * Assign a teacher to a student
   */
  async assignTeacherToStudent(params: {
    teacherId: string;
    studentId: string;
    assignedBy: string;
    assignedByRole: UserRole;
  }) {
    const { data, error } = await supabase
      .from('teacher_student_assignments')
      .insert({
        teacher_id: params.teacherId,
        student_id: params.studentId,
        assigned_by: params.assignedBy,
        assigned_by_role: params.assignedByRole
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Remove a teacher-student assignment
   */
  async removeTeacherAssignment(assignmentId: string) {
    const { error } = await supabase
      .from('teacher_student_assignments')
      .delete()
      .eq('id', assignmentId);
    if (error) throw error;
  }
}

export const userService = new UserService();
