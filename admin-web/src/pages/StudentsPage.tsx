import { useEffect, useState, useCallback } from 'react';
import { userService } from '../core/services/userService';
import { coordinatorService } from '../core/services/coordinatorService';
import { useAuth } from '../core/auth/AuthContext';
import type { Profile } from '../../../shared/types';
import { 
  UsersRound, 
  Search, 
  Plus, 
  Loader2,
  GraduationCap,
  UserCheck,
  Edit2,
  Trash2,
  X,
  UserPlus
} from 'lucide-react';

export function StudentsPage() {
  const { profile: authProfile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [coordinators, setCoordinators] = useState<Profile[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [tsAssignments, setTsAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Profile | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Individual card assignment select state
  const [selectedTeacherForStudent, setSelectedTeacherForStudent] = useState<Record<string, string>>({});

  const fetchStudentsAndRelations = useCallback(async () => {
    setLoading(true);
    try {
      const studentData = await userService.getStudentsWithAssignments();
      const coordData = await coordinatorService.getCoordinators();
      const teacherData = await userService.getTeachersWithAssignments();
      const assignmentData = await userService.getTeacherStudentAssignments();

      setCoordinators(coordData || []);
      setTeachers(teacherData || []);
      setTsAssignments(assignmentData || []);

      // Filter if coordinator
      let filteredData = studentData;
      if (authProfile?.role === 'coordinator') {
        filteredData = studentData.filter((s: any) => 
          s.assignments?.some((a: any) => a.coordinator?.id === authProfile.id)
        );
      }
      setStudents(filteredData || []);
    } catch (err) {
      console.error('Error fetching students page data:', err);
    } finally {
      setLoading(false);
    }
  }, [authProfile]);

  useEffect(() => {
    fetchStudentsAndRelations();
  }, [fetchStudentsAndRelations]);

  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.createUser({
        email: formEmail,
        displayName: formName,
        role: 'student',
        phone: formPhone,
        status: formStatus,
        password: formPassword || undefined
      });
      setShowAddModal(false);
      resetForm();
      fetchStudentsAndRelations();
    } catch (err: any) {
      setError(err?.message || 'Error enrolling student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentToEdit || !formName) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.updateUser(studentToEdit.id, {
        display_name: formName,
        phone: formPhone,
        status: formStatus as any
      });
      setShowEditModal(false);
      resetForm();
      fetchStudentsAndRelations();
    } catch (err: any) {
      setError(err?.message || 'Error updating student');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this student? (Soft delete preferred)')) return;
    try {
      await userService.deleteUser(id);
      fetchStudentsAndRelations();
    } catch (err) {
      console.error('Error deleting student:', err);
    }
  };

  const handleAssignCoordinator = async (studentId: string, coordId: string) => {
    if (!coordId) return;
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: coordId,
        student_id: studentId
      });
      fetchStudentsAndRelations();
    } catch (err) {
      console.error('Error assigning coordinator:', err);
    }
  };

  const handleAssignTeacher = async (studentId: string) => {
    const teacherId = selectedTeacherForStudent[studentId];
    if (!teacherId || !authProfile) return;
    try {
      await userService.assignTeacherToStudent({
        teacherId,
        studentId,
        assignedBy: authProfile.id,
        assignedByRole: authProfile.role
      });
      fetchStudentsAndRelations();
    } catch (err: any) {
      alert(err?.message || 'Error assigning teacher');
    }
  };

  const handleRemoveTeacher = async (assignmentId: string) => {
    if (!confirm('Are you sure you want to remove this teacher assignment?')) return;
    try {
      await userService.removeTeacherAssignment(assignmentId);
      fetchStudentsAndRelations();
    } catch (err: any) {
      alert(err?.message || 'Error removing teacher assignment');
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormStatus('active');
    setFormPassword('');
    setStudentToEdit(null);
    setError('');
  };

  const getActiveCoordinator = (profileWithAssigns: any) => {
    if (!profileWithAssigns.assignments || profileWithAssigns.assignments.length === 0) return null;
    const sorted = [...profileWithAssigns.assignments].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted[0]?.coordinator || null;
  };

  const getStudentTeachers = (studentId: string) => {
    return tsAssignments.filter(a => a.student_id === studentId);
  };

  const filtered = students.filter(s => 
    s.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Student Directory</h2>
          <p className="text-slate-500">Manage students, progress, and assignments.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700"
        >
          <Plus className="h-5 w-5" />
          Enroll Student
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
            No students found.
          </div>
        ) : (
          filtered.map((student) => {
            const activeCoord = getActiveCoordinator(student);
            const assignedTeachers = getStudentTeachers(student.id);
            
            // Check if Coordinator or Admin is allowed to manage this student
            const isManager = authProfile?.role === 'admin' || (authProfile?.role === 'coordinator' && activeCoord?.id === authProfile.id);
            
            // Filters available teachers to coordinator's scope
            const availableTeachers = authProfile?.role === 'coordinator'
              ? teachers.filter(t => {
                  const tc = getActiveCoordinator(t);
                  return tc?.id === authProfile.id;
                })
              : teachers;

            return (
              <div key={student.id} className="rounded-xl border border-slate-100 bg-white p-5 shadow-sm transition-all hover:shadow-md relative flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-lg font-bold">
                      {student.display_name?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{student.display_name}</h3>
                      <p className="text-xs text-slate-400">Joined {new Date(student.created_at).toLocaleDateString()}</p>
                      {student.phone && <p className="text-xs text-slate-400">{student.phone}</p>}
                      <p className="text-xs text-slate-400">Status: <span className="font-semibold capitalize text-emerald-600">{student.status || 'active'}</span></p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-4">
                    {/* Coordinator Assignment */}
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <UserCheck className="h-4 w-4 text-slate-400 shrink-0" />
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500">Coord:</span>
                        {authProfile?.role === 'admin' ? (
                          <select
                            value={activeCoord?.id || ''}
                            onChange={(e) => handleAssignCoordinator(student.id, e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                          >
                            <option value="">Not Assigned</option>
                            {coordinators.map(c => (
                              <option key={c.id} value={c.id}>{c.display_name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-semibold text-slate-800">{activeCoord?.display_name || 'Not Assigned'}</span>
                        )}
                      </div>
                    </div>

                    {/* Teacher Assignment List */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <GraduationCap className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-semibold text-slate-700">Assigned Faculty:</span>
                      </div>
                      
                      <div className="pl-6 space-y-1">
                        {assignedTeachers.length === 0 ? (
                          <p className="text-xs text-slate-400">No teachers assigned</p>
                        ) : (
                          assignedTeachers.map((assign: any) => (
                            <div key={assign.id} className="flex items-center justify-between bg-slate-50 px-2 py-1 rounded text-xs">
                              <span className="truncate text-slate-800 font-medium">{assign.teacher?.display_name}</span>
                              {isManager && (
                                <button 
                                  onClick={() => handleRemoveTeacher(assign.id)}
                                  className="text-slate-400 hover:text-rose-600 font-bold ml-2"
                                >
                                  ×
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Assign Teacher Dropdown */}
                    {isManager && (
                      <div className="pt-2 border-t border-slate-100 flex gap-1.5">
                        <select
                          value={selectedTeacherForStudent[student.id] || ''}
                          onChange={(e) => setSelectedTeacherForStudent(prev => ({ ...prev, [student.id]: e.target.value }))}
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs focus:border-green-500 focus:outline-none"
                        >
                          <option value="">Assign faculty...</option>
                          {availableTeachers.map(t => (
                            <option key={t.id} value={t.id}>{t.display_name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignTeacher(student.id)}
                          className="rounded bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-6 flex items-center gap-2">
                  <button 
                    onClick={() => {
                      resetForm();
                      setStudentToEdit(student);
                      setFormName(student.display_name || '');
                      setFormPhone(student.phone || '');
                      setFormStatus(student.status || 'active');
                      setShowEditModal(true);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-slate-50 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors border border-slate-100"
                  >
                    <Edit2 className="h-3 w-3" />
                    EDIT
                  </button>
                  {authProfile?.role === 'admin' && (
                    <button 
                      onClick={() => handleDeleteStudent(student.id)}
                      className="rounded-lg border border-slate-100 p-2 hover:bg-rose-50 hover:border-rose-100 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Enroll Student</h3>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <form onSubmit={handleEnrollStudent} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name *</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email Address *</label>
                <input
                  required
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone Number</label>
                <input
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Temporary Password</label>
                <input
                  type="password"
                  placeholder="Leave blank for random auto-generated"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enroll Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Edit Student</h3>
              <button onClick={() => setShowEditModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <form onSubmit={handleEditStudent} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name *</label>
                <input
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Phone Number</label>
                <input
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
