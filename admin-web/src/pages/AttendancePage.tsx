import { useEffect, useState } from 'react';
import { attendanceService } from '../core/services/attendanceService';
import { useAuth } from '../core/auth/AuthContext';
import { supabase } from '../lib/supabase';
import type { AttendanceStatus } from '../../../shared/types';
import { Loader2, Calendar as CalendarIcon, CheckCircle2, XCircle, AlertCircle, Clock, Users } from 'lucide-react';

type StudentRow = { id: string; display_name: string | null };

export function AttendancePage() {
  const { profile } = useAuth();
  const [attendance, setAttendance] = useState<any[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const canMark = profile?.role === 'teacher' || profile?.role === 'admin' || profile?.role === 'coordinator';

  useEffect(() => {
    void fetchAttendance();
    if (canMark && profile) void loadStudents();
  }, [date, profile?.id, canMark]);

  async function loadStudents() {
    if (!profile) return;

    let query = supabase.from('profiles').select('id, display_name').eq('role', 'student');

    if (profile.role === 'teacher') {
      const { data: assignments } = await supabase
        .from('coordinator_assignments')
        .select('student_id')
        .eq('teacher_id', profile.id);

      const ids = assignments?.map((a) => a.student_id).filter(Boolean) as string[];
      if (ids.length === 0) {
        setStudents([]);
        return;
      }
      query = query.in('id', ids);
    } else if (profile.role === 'coordinator') {
      const { data: assignments } = await supabase
        .from('coordinator_assignments')
        .select('student_id')
        .eq('coordinator_id', profile.id);

      const ids = assignments?.map((a) => a.student_id).filter(Boolean) as string[];
      if (ids.length === 0) {
        setStudents([]);
        return;
      }
      query = query.in('id', ids);
    }

    const { data } = await query.order('display_name');
    setStudents((data as StudentRow[]) ?? []);
  }

  async function fetchAttendance() {
    setLoading(true);
    try {
      const data = await attendanceService.getAttendance({ date });
      setAttendance(data);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleMark(studentId: string, status: AttendanceStatus) {
    if (!profile) return;
    setMarking(studentId);
    try {
      await attendanceService.markAttendance({
        studentId,
        teacherId: profile.role === 'teacher' ? profile.id : profile.id,
        status,
        date,
      });
      await fetchAttendance();
    } catch (err) {
      console.error('Error marking attendance:', err);
    } finally {
      setMarking(null);
    }
  }

  function statusForStudent(studentId: string): AttendanceStatus | null {
    const record = attendance.find((r) => r.student_id === studentId);
    return record?.status ?? null;
  }

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title">Attendance Reports</h1>
            <p className="page-subtitle">View and manage attendance records.</p>
          </div>

          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="input pl-10 w-full sm:w-auto"
              aria-label="Select date for attendance"
            />
          </div>
        </div>
      </div>

      {/* Mark Attendance */}
      {canMark && students.length > 0 ? (
        <div className="card" aria-label="Mark attendance">
          <div className="card-header">
            <h2 className="text-lg font-bold text-slate-900">Mark Attendance</h2>
          </div>
          <div className="card-body">
            <div className="space-y-2">
              {students.map((student) => {
                const current = statusForStudent(student.id);
                return (
                  <div
                    key={student.id}
                    className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-white p-3 sm:p-4 sm:flex-row sm:items-center sm:justify-between hover:border-slate-200 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="avatar-sm shrink-0" aria-hidden="true">
                        {student.display_name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <p className="font-medium text-slate-900 truncate text-sm sm:text-base">{student.display_name ?? 'Student'}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-1.5 sm:gap-2" role="group" aria-label={`Attendance options for ${student.display_name ?? 'Student'}`}>
                      {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={marking === student.id}
                          onClick={() => handleMark(student.id, status)}
                          className={`text-xs sm:text-sm rounded-lg border font-medium capitalize transition-all flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-3 sm:py-1.5 ${
                            current === status
                              ? status === 'present'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : status === 'absent'
                                ? 'bg-rose-500 text-white border-rose-500'
                                : status === 'late'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          } ${marking === student.id ? 'opacity-50' : ''}`}
                        >
                          {marking === student.id ? (
                            <Loader2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-spin" />
                          ) : status === 'present' ? (
                            <CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          ) : status === 'absent' ? (
                            <XCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          ) : status === 'late' ? (
                            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          ) : (
                            <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                          )}
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {canMark && students.length === 0 && (
        <div className="card">
          <div className="card-body">
            <div className="empty-state py-8">
              <Users className="empty-state-icon" />
              <p className="empty-state-title">No students assigned</p>
              <p className="empty-state-desc">You don't have any students assigned for attendance marking.</p>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Records */}
      <div className="card" aria-label="Attendance records">
        <div className="card-header">
          <h2 className="text-lg font-bold text-slate-900">Attendance Records</h2>
        </div>

        {/* Mobile card view */}
        {loading ? (
          <div className="card-body">
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" aria-label="Loading records" />
            </div>
          </div>
        ) : attendance.length === 0 ? (
          <div className="card-body">
            <div className="empty-state py-4">
              <CalendarIcon className="empty-state-icon" />
              <p className="empty-state-title">No records found</p>
              <p className="empty-state-desc">No attendance records for this date.</p>
            </div>
          </div>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 sm:hidden">
              {attendance.map((record) => (
                <div key={record.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="avatar-sm shrink-0" aria-hidden="true">
                        {record.student?.display_name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <span className="font-medium text-slate-900 text-sm truncate">{record.student?.display_name}</span>
                    </div>
                    <span className={`badge capitalize shrink-0 ${
                      record.status === 'present' ? 'badge-green' :
                      record.status === 'absent' ? 'badge-rose' :
                      record.status === 'late' ? 'badge-amber' :
                      'badge-blue'
                    }`}>
                      {record.status === 'present' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {record.status === 'absent' && <XCircle className="h-3 w-3 mr-1" />}
                      {record.status === 'late' && <Clock className="h-3 w-3 mr-1" />}
                      {record.status === 'excused' && <AlertCircle className="h-3 w-3 mr-1" />}
                      {record.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Group: {record.group?.name || 'N/A'}</span>
                    <span>By: {record.teacher?.display_name}</span>
                  </div>
                  <p className="text-xs text-slate-400">{record.date}</p>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="table-responsive hidden sm:block">
              <table className="table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Group</th>
                    <th>Status</th>
                    <th>Marked By</th>
                    <th className="text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((record) => (
                    <tr key={record.id}>
                      <td className="font-medium text-slate-900">
                        <div className="flex items-center gap-3">
                          <div className="avatar-sm" aria-hidden="true">
                            {record.student?.display_name?.charAt(0).toUpperCase() ?? '?'}
                          </div>
                          {record.student?.display_name}
                        </div>
                      </td>
                      <td className="text-slate-500">{record.group?.name || 'N/A'}</td>
                      <td>
                        <span className={`badge capitalize ${
                          record.status === 'present' ? 'badge-green' :
                          record.status === 'absent' ? 'badge-rose' :
                          record.status === 'late' ? 'badge-amber' :
                          'badge-blue'
                        }`}>
                          {record.status === 'present' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                          {record.status === 'absent' && <XCircle className="h-3 w-3 mr-1" />}
                          {record.status === 'late' && <Clock className="h-3 w-3 mr-1" />}
                          {record.status === 'excused' && <AlertCircle className="h-3 w-3 mr-1" />}
                          {record.status}
                        </span>
                      </td>
                      <td className="text-slate-500">{record.teacher?.display_name}</td>
                      <td className="text-right text-slate-400 text-xs">{record.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
