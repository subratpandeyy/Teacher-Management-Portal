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
  
  // Modals & Panels state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCoord, setSelectedCoord] = useState<CoordinatorWithStats | null>(null);
  const [coordToEdit, setCoordToEdit] = useState<Profile | null>(null);
  
  // Details Panel State
  const [coordAssignments, setCoordAssignments] = useState<any[]>([]);
  const [allTeachers, setAllTeachers] = useState<Profile[]>([]);
  const [allStudents, setAllStudents] = useState<Profile[]>([]);
  const [assigningTeacherId, setAssigningTeacherId] = useState('');
  const [assigningStudentId, setAssigningStudentId] = useState('');
  
  // Form State
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    fetchCoordinators();
  }, [fetchCoordinators]);

  // Load assignments and lists when details drawer opens
  const openDetailsDrawer = async (coord: CoordinatorWithStats) => {
    setSelectedCoord(coord);
    try {
      const assigns = await coordinatorService.getAssignments(coord.id);
      setCoordAssignments(assigns);
      
      const teachers = await userService.getUsers({ role: 'teacher' });
      setAllTeachers(teachers);
      if (teachers.length > 0) setAssigningTeacherId(teachers[0].id);

      const students = await userService.getUsers({ role: 'student' });
      setAllStudents(students);
      if (students.length > 0) setAssigningStudentId(students[0].id);
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
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: selectedCoord.id,
        teacher_id: assigningTeacherId
      });
      // Refresh assignments
      const assigns = await coordinatorService.getAssignments(selectedCoord.id);
      setCoordAssignments(assigns);
      fetchCoordinators();
    } catch (err) {
      console.error('Error assigning teacher:', err);
    }
  };

  const assignStudent = async () => {
    if (!selectedCoord || !assigningStudentId) return;
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: selectedCoord.id,
        student_id: assigningStudentId
      });
      // Refresh assignments
      const assigns = await coordinatorService.getAssignments(selectedCoord.id);
      setCoordAssignments(assigns);
      fetchCoordinators();
    } catch (err) {
      console.error('Error assigning student:', err);
    }
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Coordinators</h2>
          <p className="text-slate-500">Manage coordinator assignments and performance.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700"
        >
          <Plus className="h-5 w-5" />
          Add Coordinator
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search coordinators..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-green-500 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <div className="col-span-full flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-green-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-full rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-500">
            No coordinators found.
          </div>
        ) : (
          filtered.map((coord) => (
            <div key={coord.id} className="group rounded-xl border border-slate-100 bg-white p-6 shadow-sm transition-all hover:shadow-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">{coord.display_name}</h3>
                    <p className="text-xs text-slate-400">Status: <span className="font-semibold capitalize text-emerald-600">{coord.status || 'active'}</span></p>
                    {coord.phone && <p className="text-xs text-slate-400">{coord.phone}</p>}
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => {
                      resetForm();
                      setCoordToEdit(coord);
                      setFormName(coord.display_name || '');
                      setFormPhone(coord.phone || '');
                      setFormStatus(coord.status || 'active');
                      setShowEditModal(true);
                    }}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-blue-600 transition-colors"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={() => handleDeleteCoordinator(coord.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-50 pt-6">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Teachers</p>
                  <p className="text-lg font-bold text-slate-900">{coord.teacherCount}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Students</p>
                  <p className="text-lg font-bold text-slate-900">{coord.studentCount}</p>
                </div>
              </div>

              <button 
                onClick={() => openDetailsDrawer(coord)}
                className="mt-6 flex w-full items-center justify-between rounded-lg bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                View Assignments & Management
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Coordinator</h3>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <form onSubmit={handleAddCoordinator} className="space-y-4">
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
                  Create Coordinator
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
              <h3 className="text-lg font-bold text-slate-900">Edit Coordinator</h3>
              <button onClick={() => setShowEditModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <form onSubmit={handleEditCoordinator} className="space-y-4">
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

      {/* Details Drawer */}
      {selectedCoord && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl border-l border-slate-100 bg-white shadow-2xl transition-transform duration-300 sm:w-2/3 lg:w-1/2 flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">{selectedCoord.display_name}</h2>
              <p className="text-xs text-slate-400">Coordinator Assignments Panel</p>
            </div>
            <button 
              onClick={() => setSelectedCoord(null)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Manage Teachers */}
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-600" />
                Assigned Teachers
              </h3>
              
              <div className="flex gap-2">
                <select
                  value={assigningTeacherId}
                  onChange={(e) => setAssigningTeacherId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none bg-white"
                >
                  {allTeachers.map(t => (
                    <option key={t.id} value={t.id}>{t.display_name}</option>
                  ))}
                </select>
                <button
                  onClick={assignTeacher}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Assign
                </button>
              </div>

              <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                {coordAssignments.filter(a => a.teacher_id).length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">No teachers assigned.</p>
                ) : (
                  coordAssignments.filter(a => a.teacher_id).map((assign) => (
                    <div key={assign.id} className="flex items-center justify-between p-3 bg-slate-50/50">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{assign.teacher?.display_name || 'Teacher'}</p>
                        <p className="text-xs text-slate-400">Assigned on {new Date(assign.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Manage Students */}
            <div className="space-y-4">
              <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                Assigned Students
              </h3>

              <div className="flex gap-2">
                <select
                  value={assigningStudentId}
                  onChange={(e) => setAssigningStudentId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-green-500 focus:outline-none bg-white"
                >
                  {allStudents.map(s => (
                    <option key={s.id} value={s.id}>{s.display_name}</option>
                  ))}
                </select>
                <button
                  onClick={assignStudent}
                  className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Assign
                </button>
              </div>

              <div className="rounded-xl border border-slate-100 divide-y divide-slate-100">
                {coordAssignments.filter(a => a.student_id).length === 0 ? (
                  <p className="p-4 text-sm text-slate-500 text-center">No students assigned.</p>
                ) : (
                  coordAssignments.filter(a => a.student_id).map((assign) => (
                    <div key={assign.id} className="flex items-center justify-between p-3 bg-slate-50/50">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{assign.student?.display_name || 'Student'}</p>
                        <p className="text-xs text-slate-400">Assigned on {new Date(assign.created_at).toLocaleDateString()}</p>
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
