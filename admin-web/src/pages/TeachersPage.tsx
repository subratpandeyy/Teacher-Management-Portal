import { useEffect, useState, useCallback } from 'react';
import { userService } from '../core/services/userService';
import { coordinatorService } from '../core/services/coordinatorService';
import { useAuth } from '../core/auth/AuthContext';
import type { Profile } from '../../../shared/types';
import {
  Plus,
  Search,
  Loader2,
  UserCheck,
  MessageSquare,
  Edit2,
  Trash2,
  X,
  Users
} from 'lucide-react';
import { TeacherDetailPanel } from '../components/TeacherDetailPanel';

export function TeachersPage() {
  const { profile: authProfile } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [coordinators, setCoordinators] = useState<Profile[]>([]);
  const [tsAssignments, setTsAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [teacherToEdit, setTeacherToEdit] = useState<Profile | null>(null);
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [unassignTeacherId, setUnassignTeacherId] = useState<string | null>(null);
  const [unassignTeacherName, setUnassignTeacherName] = useState('');

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchTeachersAndRelations = useCallback(async () => {
    setLoading(true);
    try {
      const teacherData = await userService.getTeachersWithAssignments();
      const coordData = await coordinatorService.getCoordinators();
      const assignmentData = await userService.getTeacherStudentAssignments();

      setCoordinators(coordData || []);
      setTsAssignments(assignmentData || []);

      let filteredData = teacherData;
      if (authProfile?.role === 'coordinator') {
        filteredData = teacherData.filter((t: any) =>
          t.assignments?.some((a: any) => a.coordinator?.id === authProfile.id)
        );
      }
      setTeachers(filteredData || []);
    } catch (err) {
      console.error('Error fetching teachers page data:', err);
    } finally {
      setLoading(false);
    }
  }, [authProfile]);

  useEffect(() => {
    fetchTeachersAndRelations();
  }, [fetchTeachersAndRelations]);

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.createUser({
        email: formEmail,
        displayName: formName,
        role: 'teacher',
        phone: formPhone,
        status: formStatus,
        password: formPassword || undefined
      });
      setShowAddModal(false);
      resetForm();
      fetchTeachersAndRelations();
    } catch (err: any) {
      setError(err?.message || 'Error creating teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherToEdit || !formName) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.updateUser(teacherToEdit.id, {
        display_name: formName,
        phone: formPhone,
        status: formStatus as any
      });
      setShowEditModal(false);
      resetForm();
      fetchTeachersAndRelations();
    } catch (err: any) {
      setError(err?.message || 'Error updating teacher');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    if (!confirm('Are you sure you want to delete this teacher? (Soft delete preferred)')) return;
    try {
      await userService.deleteUser(id);
      fetchTeachersAndRelations();
    } catch (err) {
      console.error('Error deleting teacher:', err);
    }
  };

  const handleAssignCoordinator = async (teacherId: string, coordId: string, teacherName?: string) => {
    if (!coordId) {
      const activeAssign = teachers.find(t => t.id === teacherId)?.assignments?.[0];
      if (activeAssign) {
        setUnassignTeacherId(activeAssign.id);
        setUnassignTeacherName(teacherName ?? '');
        setShowUnassignModal(true);
      }
      return;
    }
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: coordId,
        teacher_id: teacherId
      });
      fetchTeachersAndRelations();
    } catch (err: any) {
      alert(err?.message || 'Error assigning coordinator');
    }
  };

  const handleUnassignCoordinator = async () => {
    if (!unassignTeacherId) return;
    try {
      await coordinatorService.removeAssignment(unassignTeacherId);
      setShowUnassignModal(false);
      setUnassignTeacherId(null);
      setUnassignTeacherName('');
      fetchTeachersAndRelations();
    } catch (err) {
      console.error('Error unassigning coordinator:', err);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormStatus('active');
    setFormPassword('');
    setTeacherToEdit(null);
    setError('');
  };

  const getActiveCoordinator = (teacher: any) => {
    if (!teacher.assignments || teacher.assignments.length === 0) return null;
    const sorted = [...teacher.assignments].sort(
      (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    return sorted[0]?.coordinator || null;
  };

  const getTeacherStudents = (teacherId: string) => {
    return tsAssignments.filter(a => a.teacher_id === teacherId);
  };

  const filtered = teachers.filter(t =>
    t.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTeacher = teachers.find(t => t.id === selectedTeacherId);

  return (
    <div className="page-container space-y-6">
      <div className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Teacher Management</h1>
          <p className="page-subtitle">Manage faculty, assignments, and class materials.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="btn-primary"
          aria-label="Add new teacher"
        >
          <Plus className="h-4 w-4" />
          Add Teacher
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search teachers by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
            aria-label="Search teachers by name"
          />
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="card-body">
            <div className="loading-page" role="status" aria-label="Loading teachers">
              <div className="spinner" />
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <Search className="empty-state-icon" />
              <p className="empty-state-title">No teachers found</p>
              <p className="empty-state-desc">Try adjusting your search or add a new teacher.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {filtered.map((teacher) => {
                const activeCoord = getActiveCoordinator(teacher);
                const assignedStudents = getTeacherStudents(teacher.id);
                return (
                  <div key={teacher.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="avatar-md bg-emerald-50 text-emerald-600 shrink-0 h-8 w-8 text-xs">
                          {teacher.display_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">{teacher.display_name}</p>
                          <p className="text-xs text-slate-400">ID: {teacher.id.slice(0, 8)}</p>
                        </div>
                      </div>
                      <span className={teacher.status === 'inactive' ? 'badge-rose shrink-0' : 'badge-green shrink-0'}>
                        {teacher.status || 'active'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <UserCheck className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                      {authProfile?.role === 'admin' ? (
                        <select
                          value={activeCoord?.id || ''}
                          onChange={(e) => handleAssignCoordinator(teacher.id, e.target.value)}
                          className="select text-xs py-1 flex-1 min-w-0"
                          aria-label={`Assign coordinator for ${teacher.display_name}`}
                        >
                          <option value="">Not Assigned</option>
                          {coordinators.map(c => (
                            <option key={c.id} value={c.id}>{c.display_name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-medium text-slate-800 truncate">{activeCoord?.display_name || 'Not Assigned'}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {assignedStudents.length === 0 ? (
                        <span className="text-xs text-slate-400">No students</span>
                      ) : (
                        assignedStudents.map((assign: any) => (
                          <span key={assign.id} className="badge-blue truncate max-w-[120px] text-[10px]">
                            {assign.student?.display_name}
                          </span>
                        ))
                      )}
                    </div>

                    {teacher.phone && <p className="text-xs text-slate-400">{teacher.phone}</p>}

                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => setSelectedTeacherId(teacher.id)}
                        className="btn-secondary btn-sm flex-1 text-xs"
                        aria-label={`View details for ${teacher.display_name}`}
                      >
                        <MessageSquare className="h-3 w-3" />
                        Details
                      </button>
                      <button
                        onClick={() => {
                          resetForm();
                          setTeacherToEdit(teacher);
                          setFormName(teacher.display_name || '');
                          setFormPhone(teacher.phone || '');
                          setFormStatus(teacher.status || 'active');
                          setShowEditModal(true);
                        }}
                        className="btn-ghost btn-sm"
                        aria-label={`Edit ${teacher.display_name}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      {authProfile?.role === 'admin' && (
                        <button
                          onClick={() => handleDeleteTeacher(teacher.id)}
                          className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                          aria-label={`Delete ${teacher.display_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="table-responsive hidden sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Teacher</th>
                    <th>Coordinator</th>
                    <th>Assigned Students</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((teacher) => {
                    const activeCoord = getActiveCoordinator(teacher);
                    const assignedStudents = getTeacherStudents(teacher.id);
                    return (
                      <tr key={teacher.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="avatar-md bg-emerald-50 text-emerald-600 shrink-0">
                              {teacher.display_name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{teacher.display_name}</p>
                              <p className="text-xs text-slate-400">ID: {teacher.id.slice(0, 8)}</p>
                              {teacher.phone && <p className="text-xs text-slate-400 truncate">{teacher.phone}</p>}
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
                            {authProfile?.role === 'admin' ? (
                              <select
                                value={activeCoord?.id || ''}
                          onChange={(e) => handleAssignCoordinator(teacher.id, e.target.value, teacher.display_name ?? undefined)}
                                className="select text-xs py-1 sm:min-w-[140px]"
                                aria-label={`Assign coordinator for ${teacher.display_name}`}
                              >
                                <option value="">Not Assigned</option>
                                {coordinators.map(c => (
                                  <option key={c.id} value={c.id}>{c.display_name}</option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-medium text-slate-800 text-sm">{activeCoord?.display_name || 'Not Assigned'}</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {assignedStudents.length === 0 ? (
                              <span className="text-xs text-slate-400">No students</span>
                            ) : (
                              assignedStudents.map((assign: any) => (
                                <span key={assign.id} className="badge-blue truncate max-w-[140px]">
                                  {assign.student?.display_name}
                                </span>
                              ))
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={teacher.status === 'inactive' ? 'badge-rose' : 'badge-green'}>
                            {teacher.status || 'active'}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => setSelectedTeacherId(teacher.id)}
                              className="btn-secondary btn-sm"
                              aria-label={`View details for ${teacher.display_name}`}
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              Details
                            </button>
                            <button
                              onClick={() => {
                                resetForm();
                                setTeacherToEdit(teacher);
                                setFormName(teacher.display_name || '');
                                setFormPhone(teacher.phone || '');
                                setFormStatus(teacher.status || 'active');
                                setShowEditModal(true);
                              }}
                              className="btn-ghost btn-sm"
                              aria-label={`Edit ${teacher.display_name}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            {authProfile?.role === 'admin' && (
                              <button
                                onClick={() => handleDeleteTeacher(teacher.id)}
                                className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                                aria-label={`Delete ${teacher.display_name}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-teacher-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="add-teacher-modal-title" className="modal-title">Add Teacher</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleAddTeacher}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="add-teacher-name">Full Name *</label>
                  <input
                    id="add-teacher-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                    placeholder="Sarah Wilson"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-teacher-email">Email Address *</label>
                  <input
                    id="add-teacher-email"
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="input"
                    placeholder="sarah@example.com"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-teacher-phone">Phone Number</label>
                  <input
                    id="add-teacher-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-teacher-password">Temporary Password</label>
                  <input
                    id="add-teacher-password"
                    type="password"
                    placeholder="Leave blank for random auto-generated"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-teacher-status">Status</label>
                  <select
                    id="add-teacher-status"
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
                  Create Teacher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-teacher-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="edit-teacher-modal-title" className="modal-title">Edit Teacher</h2>
              <button onClick={() => setShowEditModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleEditTeacher}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="edit-teacher-name">Full Name *</label>
                  <input
                    id="edit-teacher-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-teacher-phone">Phone Number</label>
                  <input
                    id="edit-teacher-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-teacher-status">Status</label>
                  <select
                    id="edit-teacher-status"
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

      {showUnassignModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="unassign-teacher-modal-title">
          <div className="modal max-w-md">
            <div className="modal-header">
              <h2 id="unassign-teacher-modal-title" className="modal-title">Confirm Unassignment</h2>
              <button onClick={() => { setShowUnassignModal(false); setUnassignTeacherId(null); setUnassignTeacherName(''); }} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-slate-600">
                Are you sure you want to remove <strong>{unassignTeacherName}</strong> from their assigned coordinator?
              </p>
              <p className="text-xs text-slate-400 mt-2">
                The teacher will become available for reassignment.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowUnassignModal(false); setUnassignTeacherId(null); setUnassignTeacherName(''); }} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleUnassignCoordinator} className="btn-danger">
                <X className="h-4 w-4" />
                Unassign
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTeacher && (
        <TeacherDetailPanel
          teacher={selectedTeacher}
          onClose={() => setSelectedTeacherId(null)}
        />
      )}
    </div>
  );
}
