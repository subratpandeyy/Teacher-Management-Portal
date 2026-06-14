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

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [teacherToEdit, setTeacherToEdit] = useState<Profile | null>(null);

  // Form state
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

      // Filter if coordinator
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

  const handleAssignCoordinator = async (teacherId: string, coordId: string) => {
    if (!coordId) return;
    try {
      await coordinatorService.assignToCoordinator({
        coordinator_id: coordId,
        teacher_id: teacherId
      });
      fetchTeachersAndRelations();
    } catch (err) {
      console.error('Error assigning coordinator:', err);
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Teacher Management</h2>
          <p className="text-slate-500">Manage faculty, assignments, and class materials.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700"
        >
          <Plus className="h-5 w-5" />
          Add Teacher
        </button>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search teachers by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4">Teacher</th>
                <th className="px-6 py-4">Coordinator</th>
                <th className="px-6 py-4">Assigned Students</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-green-600" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No teachers found.
                  </td>
                </tr>
              ) : (
                filtered.map((teacher) => {
                  const activeCoord = getActiveCoordinator(teacher);
                  const assignedStudents = getTeacherStudents(teacher.id);
                  return (
                    <tr key={teacher.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold">
                            {teacher.display_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{teacher.display_name}</p>
                            <p className="text-xs text-slate-400">ID: {teacher.id.slice(0, 8)}</p>
                            {teacher.phone && <p className="text-xs text-slate-400">{teacher.phone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-slate-400" />
                          {authProfile?.role === 'admin' ? (
                            <select
                              value={activeCoord?.id || ''}
                              onChange={(e) => handleAssignCoordinator(teacher.id, e.target.value)}
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
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {assignedStudents.length === 0 ? (
                            <span className="text-xs text-slate-400">No students</span>
                          ) : (
                            assignedStudents.map((assign: any) => (
                              <span key={assign.id} className="inline-flex bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[11px] font-medium truncate max-w-[150px]">
                                {assign.student?.display_name}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500 capitalize text-xs">
                        {teacher.status || 'active'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => setSelectedTeacherId(teacher.id)}
                            className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            DETAILS
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
                            className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          {authProfile?.role === 'admin' && (
                            <button 
                              onClick={() => handleDeleteTeacher(teacher.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Add Teacher</h3>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <form onSubmit={handleAddTeacher} className="space-y-4">
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
                  Create Teacher
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
              <h3 className="text-lg font-bold text-slate-900">Edit Teacher</h3>
              <button onClick={() => setShowEditModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <form onSubmit={handleEditTeacher} className="space-y-4">
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

      {selectedTeacher && (
        <TeacherDetailPanel 
          teacher={selectedTeacher} 
          onClose={() => setSelectedTeacherId(null)} 
        />
      )}
    </div>
  );
}
