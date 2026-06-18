import { useEffect, useState, useCallback } from 'react';
import { coordinatorService } from '../core/services/coordinatorService';
import { userService } from '../core/services/userService';
import type { Profile } from '../../../shared/types';
import {
  UserCheck,
  Users,
  Plus,
  Search,
  Loader2,
  ChevronRight,
  X,
  Edit2,
  Trash2,
  UserPlus
} from 'lucide-react';

type CoordinatorWithStats = Profile & { teacherCount: number; studentCount: number };

export function CoordinatorsPage() {
  const [coordinators, setCoordinators] = useState<CoordinatorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<CoordinatorWithStats | null>(null);
  const [coordToEdit, setCoordToEdit] = useState<Profile | null>(null);

  const [coordAssignments, setCoordAssignments] = useState<any[]>([]);
  const [unassignedTeachers, setUnassignedTeachers] = useState<Profile[]>([]);
  const [unassignedStudents, setUnassignedStudents] = useState<Profile[]>([]);
  const [assigningTeacherId, setAssigningTeacherId] = useState('');
  const [assigningStudentId, setAssigningStudentId] = useState('');

  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<{ id: string; name: string; type: 'teacher' | 'student' } | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [assignError, setAssignError] = useState('');

  const [activeTab] = useState<'list'>('list');

  const fetchCoordinators = useCallback(async () => {
    setLoading(true);
    try {
      const data = await coordinatorService.getCoordinators();
      const withStats = await Promise.all(
        data.map(async (coord) => {
          const stats = await coordinatorService.getCoordinatorStats(coord.id);
          return { ...coord, ...stats };
        })
      );
      setCoordinators(withStats);
    } catch (err) {
      console.error('Error fetching coordinators:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnassigned = useCallback(async () => {
    try {
      const [teachers, students] = await Promise.all([
        coordinatorService.getUnassignedTeachers(),
        coordinatorService.getUnassignedStudents(),
      ]);
      setUnassignedTeachers(teachers);
      if (teachers.length > 0) setAssigningTeacherId(teachers[0].id);
      setUnassignedStudents(students);
      if (students.length > 0) setAssigningStudentId(students[0].id);
    } catch (err) {
      console.error('Error loading unassigned users:', err);
    }
  }, []);

  useEffect(() => {
    void fetchCoordinators();
    void fetchUnassigned();
  }, [fetchCoordinators, fetchUnassigned]);

  const openDetailsDrawer = async (coord: CoordinatorWithStats) => {
    setSelectedCoord(coord);
    setAssignError('');
    try {
      const assigns = await coordinatorService.getAssignments(coord.id);
      setCoordAssignments(assigns);
    } catch (err) {
      console.error('Error opening details drawer:', err);
    }
  };

  const handleAddCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.createUser({
        email: formEmail,
        displayName: formName,
        role: 'coordinator',
        phone: formPhone,
        status: formStatus,
        password: formPassword || undefined
      });
      setShowAddModal(false);
      resetForm();
      fetchCoordinators();
    } catch (err: any) {
      setError(err?.message || 'Error creating coordinator');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordToEdit || !formName) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.updateUser(coordToEdit.id, {
        display_name: formName,
        phone: formPhone,
        status: formStatus as any
      });
      setShowEditModal(false);
      resetForm();
      fetchCoordinators();
    } catch (err: any) {
      setError(err?.message || 'Error updating coordinator');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCoordinator = async (id: string) => {
    if (!confirm('Are you sure you want to delete this coordinator? (Soft delete preferred)')) return;
    try {
      await userService.deleteUser(id);
      if (selectedCoord?.id === id) setSelectedCoord(null);
      fetchCoordinators();
    } catch (err) {
      console.error('Error deleting coordinator:', err);
    }
  };

  const assignTeacher = async () => {
    if (!selectedCoord || !assigningTeacherId) return;
    setAssignError('');
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: selectedCoord.id,
        teacher_id: assigningTeacherId
      });
      await refreshAssignmentsAndStats(selectedCoord.id);
      await fetchUnassigned();
    } catch (err: any) {
      setAssignError(err?.message || 'Error assigning teacher');
    }
  };

  const assignStudent = async () => {
    if (!selectedCoord || !assigningStudentId) return;
    setAssignError('');
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: selectedCoord.id,
        student_id: assigningStudentId
      });
      await refreshAssignmentsAndStats(selectedCoord.id);
      await fetchUnassigned();
    } catch (err: any) {
      setAssignError(err?.message || 'Error assigning student');
    }
  };

  const confirmUnassign = (assignment: any, type: 'teacher' | 'student') => {
    const profile = type === 'teacher' ? assignment.teacher : assignment.student;
    setUnassignTarget({ id: assignment.id, name: profile?.display_name || 'User', type });
    setShowUnassignModal(true);
  };

  const handleUnassign = async () => {
    if (!unassignTarget || !selectedCoord) return;
    try {
      await coordinatorService.removeAssignment(unassignTarget.id);
      setShowUnassignModal(false);
      setUnassignTarget(null);
      await refreshAssignmentsAndStats(selectedCoord.id);
      await fetchUnassigned();
    } catch (err) {
      console.error('Error unassigning:', err);
    }
  };

  const refreshAssignmentsAndStats = async (coordId: string) => {
    const [assigns] = await Promise.all([
      coordinatorService.getAssignments(coordId),
    ]);
    setCoordAssignments(assigns);
    fetchCoordinators();
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormStatus('active');
    setFormPassword('');
    setCoordToEdit(null);
    setError('');
  };

  const filtered = coordinators.filter(c =>
    c.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="page-container space-y-6">
      <div className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Coordinators</h1>
          <p className="page-subtitle">Manage coordinator assignments and performance.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="btn-primary"
          aria-label="Add new coordinator"
        >
          <Plus className="h-4 w-4" />
          Add Coordinator
        </button>
      </div>

      <div className="tabs" role="tablist" aria-label="Coordinator sections">
        <button
          role="tab"
          aria-selected={activeTab === 'list'}
          className={`tab ${activeTab === 'list' ? 'tab-active' : ''}`}
        >
          Coordinators List
        </button>
      </div>

      {activeTab === 'list' && (
        <div className="space-y-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder="Search coordinators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10"
              aria-label="Search coordinators by name"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <div className="col-span-full loading-page" role="status" aria-label="Loading coordinators">
                <div className="spinner" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="col-span-full empty-state">
                <UserCheck className="empty-state-icon" />
                <p className="empty-state-title">No coordinators found</p>
                <p className="empty-state-desc">Add a coordinator to get started.</p>
              </div>
            ) : (
              filtered.map((coord) => (
                <div key={coord.id} className="card group relative flex flex-col">
                  <div className="card-body flex-1">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="avatar-lg bg-amber-50 text-amber-600">
                          {coord.display_name?.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-900 truncate">{coord.display_name}</h3>
                          <p className="text-xs text-slate-400">{coord.email}</p>
                          <span className={coord.status === 'inactive' ? 'badge-rose text-[10px]' : 'badge-green text-[10px]'}>
                            {coord.status || 'active'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => {
                            resetForm();
                            setCoordToEdit(coord);
                            setFormName(coord.display_name || '');
                            setFormPhone(coord.phone || '');
                            setFormStatus(coord.status || 'active');
                            setShowEditModal(true);
                          }}
                          className="btn-ghost btn-sm"
                          aria-label={`Edit ${coord.display_name}`}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCoordinator(coord.id)}
                          className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                          aria-label={`Delete ${coord.display_name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-slate-50 p-3 text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Teachers</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">{coord.teacherCount}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3 text-center">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Students</p>
                        <p className="mt-1 text-xl font-bold text-slate-900">{coord.studentCount}</p>
                      </div>
                    </div>
                  </div>

                  <div className="card-footer pt-0">
                    <button
                      onClick={() => openDetailsDrawer(coord)}
                      className="btn-secondary w-full justify-between"
                      aria-label={`View assignments for ${coord.display_name}`}
                    >
                      <span>View Assignments</span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-coord-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="add-coord-modal-title" className="modal-title">Add Coordinator</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleAddCoordinator}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="add-coord-name">Full Name *</label>
                  <input
                    id="add-coord-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                    placeholder="Jane Smith"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-coord-email">Email Address *</label>
                  <input
                    id="add-coord-email"
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="input"
                    placeholder="jane@example.com"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-coord-phone">Phone Number</label>
                  <input
                    id="add-coord-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-coord-password">Temporary Password</label>
                  <input
                    id="add-coord-password"
                    type="password"
                    placeholder="Leave blank for random auto-generated"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-coord-status">Status</label>
                  <select
                    id="add-coord-status"
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
                  Create Coordinator
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-coord-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="edit-coord-modal-title" className="modal-title">Edit Coordinator</h2>
              <button onClick={() => setShowEditModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleEditCoordinator}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="edit-coord-name">Full Name *</label>
                  <input
                    id="edit-coord-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-coord-phone">Phone Number</label>
                  <input
                    id="edit-coord-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-coord-status">Status</label>
                  <select
                    id="edit-coord-status"
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
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="unassign-modal-title">
          <div className="modal max-w-md">
            <div className="modal-header">
              <h2 id="unassign-modal-title" className="modal-title">Confirm Unassignment</h2>
              <button onClick={() => { setShowUnassignModal(false); setUnassignTarget(null); }} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-slate-600">
                Are you sure you want to unassign <strong>{unassignTarget?.name}</strong> from this coordinator?
              </p>
              <p className="text-xs text-slate-400 mt-2">
                The {unassignTarget?.type} will become available for reassignment.
              </p>
            </div>
            <div className="modal-footer">
              <button onClick={() => { setShowUnassignModal(false); setUnassignTarget(null); }} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleUnassign} className="btn-danger">
                <X className="h-4 w-4" />
                Unassign
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCoord && (
        <div
          className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-slate-200 bg-white shadow-2xl lg:max-w-2xl flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={`${selectedCoord.display_name} details`}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="avatar-md bg-amber-50 text-amber-600 shrink-0">
                {selectedCoord.display_name?.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 truncate">{selectedCoord.display_name}</h2>
                <p className="text-xs text-slate-400">Coordinator Panel</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedCoord(null)}
              className="btn-ghost rounded-lg p-2 shrink-0"
              aria-label="Close panel"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {assignError && (
            <div className="px-6 pt-4">
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{assignError}</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-600" />
                Assigned Teachers
              </h3>

              {unassignedTeachers.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={assigningTeacherId}
                    onChange={(e) => setAssigningTeacherId(e.target.value)}
                    className="select flex-1"
                    aria-label="Select teacher to assign"
                  >
                    {unassignedTeachers.map(t => (
                      <option key={t.id} value={t.id}>{t.display_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={assignTeacher}
                    className="btn-primary btn-sm"
                    aria-label="Assign teacher"
                  >
                    Assign
                  </button>
                </div>
              )}
              {unassignedTeachers.length === 0 && (
                <p className="text-xs text-slate-400">All teachers are currently assigned.</p>
              )}

              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {coordAssignments.filter(a => a.teacher_id).length === 0 ? (
                  <p className="p-5 text-sm text-slate-500 text-center">No teachers assigned.</p>
                ) : (
                  coordAssignments.filter(a => a.teacher_id).map((assign) => (
                    <div key={assign.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="avatar-sm shrink-0">
                          {assign.teacher?.display_name?.charAt(0).toUpperCase() || 'T'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{assign.teacher?.display_name || 'Teacher'}</p>
                          <p className="text-xs text-slate-400">Assigned {new Date(assign.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge-green shrink-0">Active</span>
                        <button
                          onClick={() => confirmUnassign(assign, 'teacher')}
                          className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                          aria-label={`Unassign ${assign.teacher?.display_name || 'teacher'}`}
                          title="Unassign"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-600" />
                Assigned Students
              </h3>

              {unassignedStudents.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={assigningStudentId}
                    onChange={(e) => setAssigningStudentId(e.target.value)}
                    className="select flex-1"
                    aria-label="Select student to assign"
                  >
                    {unassignedStudents.map(s => (
                      <option key={s.id} value={s.id}>{s.display_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={assignStudent}
                    className="btn-primary btn-sm"
                    aria-label="Assign student"
                  >
                    Assign
                  </button>
                </div>
              )}
              {unassignedStudents.length === 0 && (
                <p className="text-xs text-slate-400">All students are currently assigned.</p>
              )}

              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {coordAssignments.filter(a => a.student_id).length === 0 ? (
                  <p className="p-5 text-sm text-slate-500 text-center">No students assigned.</p>
                ) : (
                  coordAssignments.filter(a => a.student_id).map((assign) => (
                    <div key={assign.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="avatar-sm shrink-0">
                          {assign.student?.display_name?.charAt(0).toUpperCase() || 'S'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">{assign.student?.display_name || 'Student'}</p>
                          <p className="text-xs text-slate-400">Assigned {new Date(assign.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="badge-green shrink-0">Active</span>
                        <button
                          onClick={() => confirmUnassign(assign, 'student')}
                          className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                          aria-label={`Unassign ${assign.student?.display_name || 'student'}`}
                          title="Unassign"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
