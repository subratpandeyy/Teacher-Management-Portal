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
  

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [studentToEdit, setStudentToEdit] = useState<Profile | null>(null);
  const [showCoordUnassignModal, setShowCoordUnassignModal] = useState(false);
  const [coordUnassignId, setCoordUnassignId] = useState<string | null>(null);
  const [coordUnassignName, setCoordUnassignName] = useState('');

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  const handleAssignCoordinator = async (studentId: string, coordId: string, studentName?: string) => {
    if (!coordId) {
      const student = students.find(s => s.id === studentId);
      const activeAssign = student?.assignments?.[0];
      if (activeAssign) {
        setCoordUnassignId(activeAssign.id);
        setCoordUnassignName(studentName ?? '');
        setShowCoordUnassignModal(true);
      }
      return;
    }
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: coordId,
        student_id: studentId
      });
      fetchStudentsAndRelations();
    } catch (err: any) {
      alert(err?.message || 'Error assigning coordinator');
    }
  };

  const handleCoordUnassignConfirm = async () => {
    if (!coordUnassignId) return;
    try {
      await coordinatorService.removeAssignment(coordUnassignId);
      setShowCoordUnassignModal(false);
      setCoordUnassignId(null);
      setCoordUnassignName('');
      fetchStudentsAndRelations();
    } catch (err) {
      console.error('Error unassigning coordinator:', err);
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
    <div className="page-container space-y-6">
      <div className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Student Directory</h1>
          <p className="page-subtitle">Manage students, progress, and assignments.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="btn-primary"
          aria-label="Enroll new student"
        >
          <Plus className="h-4 w-4" />
          Enroll Student
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10"
          aria-label="Search students by name"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {loading ? (
          <div className="col-span-full loading-page" role="status" aria-label="Loading students">
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full empty-state">
            <UsersRound className="empty-state-icon" />
            <p className="empty-state-title">No students found</p>
            <p className="empty-state-desc">Try adjusting your search.</p>
          </div>
        ) : (
          filtered.map((student) => {
            const activeCoord = getActiveCoordinator(student);
            const assignedTeachers = getStudentTeachers(student.id);

            const isManager = authProfile?.role === 'admin' || (authProfile?.role === 'coordinator' && activeCoord?.id === authProfile.id);

            const availableTeachers = authProfile?.role === 'coordinator'
              ? teachers.filter(t => {
                  const tc = getActiveCoordinator(t);
                  return tc?.id === authProfile.id;
                })
              : teachers;

            return (
              <div key={student.id} className="card relative flex flex-col">
                <div className="card-body flex-1">
                  <div className="flex items-center gap-3">
                    <div className="avatar-lg bg-blue-50 text-blue-600 shrink-0">
                      {student.display_name?.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-slate-900 truncate">{student.display_name}</h3>
                      <p className="text-xs text-slate-400">Joined {new Date(student.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                      <span className={student.status === 'inactive' ? 'badge-rose text-[10px]' : 'badge-green text-[10px]'}>
                        {student.status || 'active'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <UserCheck className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="text-slate-500 text-xs font-medium">Coordinator:</span>
                      {authProfile?.role === 'admin' ? (
                        <select
                          value={activeCoord?.id || ''}
                          onChange={(e) => handleAssignCoordinator(student.id, e.target.value, student.display_name ?? undefined)}
                          className="select text-xs py-1 flex-1 min-w-0"
                          aria-label={`Assign coordinator for ${student.display_name}`}
                        >
                          <option value="">Not Assigned</option>
                          {coordinators.map(c => (
                            <option key={c.id} value={c.id}>{c.display_name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium text-slate-800 text-xs truncate">{activeCoord?.display_name || 'Not Assigned'}</span>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-sm">
                        <GraduationCap className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                        <span className="text-xs font-medium text-slate-600">Assigned Faculty:</span>
                      </div>

                      <div className="space-y-1">
                        {assignedTeachers.length === 0 ? (
                          <p className="text-xs text-slate-400 pl-1">No teachers assigned</p>
                        ) : (
                          assignedTeachers.map((assign: any) => (
                            <div key={assign.id} className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5">
                              <span className="text-xs font-medium text-slate-700 truncate">{assign.teacher?.display_name}</span>
                              {isManager && (
                                <button
                                  onClick={() => handleRemoveTeacher(assign.id)}
                                  className="shrink-0 ml-2 text-slate-400 hover:text-rose-600 transition-colors"
                                  aria-label={`Remove teacher ${assign.teacher?.display_name}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {isManager && (
                      <div className="flex gap-1.5 pt-1">
                        <select
                          value={selectedTeacherForStudent[student.id] || ''}
                          onChange={(e) => setSelectedTeacherForStudent(prev => ({ ...prev, [student.id]: e.target.value }))}
                          className="select text-xs py-1 flex-1 min-w-0"
                          aria-label={`Assign teacher for ${student.display_name}`}
                        >
                          <option value="">Assign faculty...</option>
                          {availableTeachers.map(t => (
                            <option key={t.id} value={t.id}>{t.display_name}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignTeacher(student.id)}
                          className="btn-primary btn-sm shrink-0"
                          aria-label="Add teacher assignment"
                        >
                          Add
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="card-footer flex gap-2 border-t border-slate-100 pt-4">
                  <button
                    onClick={() => {
                      resetForm();
                      setStudentToEdit(student);
                      setFormName(student.display_name || '');
                      setFormPhone(student.phone || '');
                      setFormStatus(student.status || 'active');
                      setShowEditModal(true);
                    }}
                    className="btn-secondary btn-sm flex-1"
                    aria-label={`Edit ${student.display_name}`}
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </button>
                  {authProfile?.role === 'admin' && (
                    <button
                      onClick={() => handleDeleteStudent(student.id)}
                      className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                      aria-label={`Delete ${student.display_name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-student-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="add-student-modal-title" className="modal-title">Enroll Student</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleEnrollStudent}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="add-student-name">Full Name *</label>
                  <input
                    id="add-student-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                    placeholder="Alex Johnson"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-student-email">Email Address *</label>
                  <input
                    id="add-student-email"
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="input"
                    placeholder="alex@example.com"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-student-phone">Phone Number</label>
                  <input
                    id="add-student-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-student-password">Temporary Password</label>
                  <input
                    id="add-student-password"
                    type="password"
                    placeholder="Leave blank for random auto-generated"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-student-status">Status</label>
                  <select
                    id="add-student-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="select"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowAddModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enroll Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-student-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="edit-student-modal-title" className="modal-title">Edit Student</h2>
              <button onClick={() => setShowEditModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleEditStudent}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="edit-student-name">Full Name *</label>
                  <input
                    id="edit-student-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-student-phone">Phone Number</label>
                  <input
                    id="edit-student-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-student-status">Status</label>
                  <select
                    id="edit-student-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="select"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowEditModal(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="btn-primary">
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCoordUnassignModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="unassign-student-modal-title">
          <div className="modal max-w-md">
            <div className="modal-header">
              <h2 id="unassign-student-modal-title" className="modal-title">Confirm Unassignment</h2>
              <button onClick={() => { setShowCoordUnassignModal(false); setCoordUnassignId(null); setCoordUnassignName(''); }} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-slate-600">
                Are you sure you want to remove <strong>{coordUnassignName}</strong> from their assigned coordinator?
              </p>
              <p className="text-xs text-slate-400 mt-2">
                The student will become available for reassignment.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowCoordUnassignModal(false); setCoordUnassignId(null); setCoordUnassignName(''); }} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleCoordUnassignConfirm} className="btn-danger">
                <X className="h-4 w-4" />
                Unassign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
