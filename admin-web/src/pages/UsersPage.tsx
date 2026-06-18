import { useEffect, useState, useCallback } from 'react';
import { userService } from '../core/services/userService';
import type { Profile, UserRole } from '../../../shared/types';
import {
  Search,
  UserPlus,
  Filter,
  Loader2,
  Trash2,
  Edit2,
  X
} from 'lucide-react';

export function UsersPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<Profile | null>(null);

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [formRole, setFormRole] = useState<UserRole>('teacher');
  const [formPassword, setFormPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userService.getUsers({
        role: roleFilter === 'all' ? undefined : roleFilter
      });
      setUsers(data || []);
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.createUser({
        email: formEmail,
        displayName: formName,
        role: formRole,
        phone: formPhone,
        status: formStatus,
        password: formPassword || undefined
      });
      setShowAddModal(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setError(err?.message || 'Error creating user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userToEdit || !formName) return;
    setSubmitting(true);
    setError('');
    try {
      await userService.updateUser(userToEdit.id, {
        display_name: formName,
        phone: formPhone,
        status: formStatus as any,
        role: formRole
      });
      setShowEditModal(false);
      resetForm();
      fetchUsers();
    } catch (err: any) {
      setError(err?.message || 'Error updating user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? (Soft delete preferred)')) return;
    try {
      await userService.deleteUser(userId);
      fetchUsers();
    } catch (err) {
      console.error('Error deleting user:', err);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormEmail('');
    setFormPhone('');
    setFormStatus('active');
    setFormRole('teacher');
    setFormPassword('');
    setUserToEdit(null);
    setError('');
  };

  const filteredUsers = users.filter(u =>
    u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const roleBadge = (role: string) => {
    switch (role) {
      case 'admin': return 'role-admin';
      case 'coordinator': return 'role-coordinator';
      case 'teacher': return 'role-teacher';
      case 'student': return 'role-student';
      default: return 'badge-slate';
    }
  };

  const statusBadge = (status?: string | null) => {
    if (!status || status === 'active') return 'badge-green';
    return 'badge-slate';
  };

  return (
    <div className="page-container space-y-6">
      <div className="page-header flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage all system users and their roles.</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowAddModal(true); }}
          className="btn-primary"
          aria-label="Add new user"
        >
          <UserPlus className="h-4 w-4" />
          Add User
        </button>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
            aria-label="Search users by name"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Filter className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="select"
            aria-label="Filter by role"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="coordinator">Coordinator</option>
            <option value="teacher">Teacher</option>
            <option value="student">Student</option>
          </select>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="card-body">
            <div className="loading-page" role="status" aria-label="Loading users">
              <div className="spinner" />
            </div>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <Search className="empty-state-icon" />
              <p className="empty-state-title">No users found</p>
              <p className="empty-state-desc">Try adjusting your search or filter.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {filteredUsers.map((user) => (
                <div key={user.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="avatar-sm shrink-0" aria-hidden="true">
                        {user.display_name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900 text-sm truncate">{user.display_name}</p>
                        <p className="text-xs text-slate-400 truncate">{user.email}</p>
                      </div>
                    </div>
                    <span className={roleBadge(user.role)}>
                      {user.role}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{user.phone || 'No phone'}</span>
                    <span className={statusBadge(user.status)}>
                      {user.status || 'active'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      Joined {new Date(user.created_at).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric'
                      })}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          resetForm();
                          setUserToEdit(user);
                          setFormName(user.display_name || '');
                          setFormEmail(user.email || '');
                          setFormPhone(user.phone || '');
                          setFormStatus(user.status || 'active');
                          setFormRole(user.role);
                          setShowEditModal(true);
                        }}
                        className="btn-ghost btn-sm"
                        aria-label={`Edit ${user.display_name}`}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                        aria-label={`Delete ${user.display_name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="table-responsive hidden sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar-sm" aria-hidden="true">
                            {user.display_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">{user.display_name}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={roleBadge(user.role)}>
                          {user.role}
                        </span>
                      </td>
                      <td className="text-slate-500">
                        {user.phone || '—'}
                      </td>
                      <td>
                        <span className={statusBadge(user.status)}>
                          {user.status || 'active'}
                        </span>
                      </td>
                      <td className="text-slate-500 text-xs">
                        {new Date(user.created_at).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric'
                        })}
                      </td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => {
                              resetForm();
                              setUserToEdit(user);
                              setFormName(user.display_name || '');
                              setFormEmail(user.email || '');
                              setFormPhone(user.phone || '');
                              setFormStatus(user.status || 'active');
                              setFormRole(user.role);
                              setShowEditModal(true);
                            }}
                            className="btn-ghost btn-sm"
                            aria-label={`Edit ${user.display_name}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
                            className="btn-ghost btn-sm text-slate-400 hover:text-rose-600"
                            aria-label={`Delete ${user.display_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showAddModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="add-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="add-modal-title" className="modal-title">Add User</h2>
              <button onClick={() => setShowAddModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleAddUser}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="add-name">Full Name *</label>
                  <input
                    id="add-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-email">Email Address *</label>
                  <input
                    id="add-email"
                    required
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="input"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-phone">Phone Number</label>
                  <input
                    id="add-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-password">Temporary Password</label>
                  <input
                    id="add-password"
                    type="password"
                    placeholder="Leave blank for random auto-generated"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="add-role">Role</label>
                  <select
                    id="add-role"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="select"
                  >
                    <option value="admin">Admin</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="add-status">Status</label>
                  <select
                    id="add-status"
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
                  Create User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-modal-title">
          <div className="modal">
            <div className="modal-header">
              <h2 id="edit-modal-title" className="modal-title">Edit User</h2>
              <button onClick={() => setShowEditModal(false)} className="btn-ghost rounded-lg p-1.5" aria-label="Close modal">
                <X className="h-5 w-5" />
              </button>
            </div>
            {error && (
              <div className="px-6 pt-4">
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>
              </div>
            )}
            <form onSubmit={handleEditUser}>
              <div className="modal-body space-y-4">
                <div>
                  <label className="label" htmlFor="edit-name">Full Name *</label>
                  <input
                    id="edit-name"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-phone">Phone Number</label>
                  <input
                    id="edit-phone"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-role">Role</label>
                  <select
                    id="edit-role"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="select"
                  >
                    <option value="admin">Admin</option>
                    <option value="coordinator">Coordinator</option>
                    <option value="teacher">Teacher</option>
                    <option value="student">Student</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="edit-status">Status</label>
                  <select
                    id="edit-status"
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
    </div>
  );
}
