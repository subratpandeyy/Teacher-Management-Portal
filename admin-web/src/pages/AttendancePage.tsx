import { useEffect, useState } from 'react';
import { attendanceService } from '../core/services/attendanceService';
import { useAuth } from '../core/auth/AuthContext';
import { supabase } from '../lib/supabase';
import type { AttendanceStatus } from '../../../shared/types';
import { Loader2, Calendar as CalendarIcon } from 'lucide-react';

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance Reports</h2>
          <p className="text-slate-500">View and manage attendance records.</p>
        </div>

        <div className="relative">
          <CalendarIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-slate-200 pl-10 pr-4 py-2 text-sm focus:border-green-500 focus:outline-none"
          />
        </div>
      </div>

      {canMark && students.length > 0 ? (
        <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-bold text-slate-900">Mark Attendance</h3>
          <div className="space-y-3">
            {students.map((student) => {
              const current = statusForStudent(student.id);
              return (
                <div
                  key={student.id}
                  className="flex flex-col gap-3 rounded-lg border border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <p className="font-medium text-slate-900">{student.display_name ?? 'Student'}</p>
                  <div className="flex flex-wrap gap-2">
                    {(['present', 'absent', 'late', 'excused'] as AttendanceStatus[]).map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={marking === student.id}
                        onClick={() => handleMark(student.id, status)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                          current === status
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4">Student</th>
                <th className="px-6 py-4">Group</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Marked By</th>
                <th className="px-6 py-4 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-green-600" />
                  </td>
                </tr>
              ) : attendance.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No records found for this date.
                  </td>
                </tr>
              ) : (
                attendance.map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-slate-900">{record.student?.display_name}</td>
                    <td className="px-6 py-4 text-slate-600">{record.group?.name || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        record.status === 'present' ? 'bg-emerald-50 text-emerald-700' :
                        record.status === 'absent' ? 'bg-rose-50 text-rose-700' :
                        'bg-amber-50 text-amber-700'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{record.teacher?.display_name}</td>
                    <td className="px-6 py-4 text-right text-slate-500">{record.date}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
