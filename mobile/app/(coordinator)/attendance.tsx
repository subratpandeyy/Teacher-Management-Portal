import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, FlatList, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';

export default function CoordinatorAttendance() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD

  // Mapping of studentId -> teacherId
  const [studentTeacherMap, setStudentTeacherMap] = useState<Record<string, string>>({});
  // Fallback teacher in coordinator scope
  const [fallbackTeacherId, setFallbackTeacherId] = useState<string>('');

  const fetchScopeData = useCallback(async () => {
    if (!profile) return;
    try {
      // 1. Find all active assignments in scope to get students & teachers
      const { data: allAssigns } = await supabase
        .from('coordinator_assignments')
        .select('*')
        .order('created_at', { ascending: true });

      const latestStudentMap = new Map();
      const latestTeacherMap = new Map();

      for (const a of allAssigns || []) {
        if (a.student_id) latestStudentMap.set(a.student_id, a.coordinator_id);
        if (a.teacher_id) latestTeacherMap.set(a.teacher_id, a.coordinator_id);
      }

      const inScopeStudentIds: string[] = [];
      latestStudentMap.forEach((coordId, studentId) => {
        if (coordId === profile.id) inScopeStudentIds.push(studentId);
      });

      const inScopeTeacherIds: string[] = [];
      latestTeacherMap.forEach((coordId, teacherId) => {
        if (coordId === profile.id) inScopeTeacherIds.push(teacherId);
      });

      if (inScopeTeacherIds.length > 0) {
        setFallbackTeacherId(inScopeTeacherIds[0]);
      } else {
        setFallbackTeacherId(profile.id); // ultimate fallback is coordinator's own profile
      }

      if (inScopeStudentIds.length === 0) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Fetch profiles of these student IDs
      const { data: studentProfiles } = await supabase
        .from('profiles')
        .select('id, display_name, phone')
        .in('id', inScopeStudentIds)
        .is('deleted_at', null)
        .order('display_name');

      setStudents(studentProfiles || []);

      // 2. Fetch teacher student assignments to know which teacher to record
      const { data: teacherAssignments } = await supabase
        .from('teacher_student_assignments')
        .select('student_id, teacher_id')
        .in('student_id', inScopeStudentIds);

      const mapping: Record<string, string> = {};
      for (const ta of teacherAssignments || []) {
        mapping[ta.student_id] = ta.teacher_id;
      }
      setStudentTeacherMap(mapping);

      // 3. Fetch attendance for these students on the selected date
      const { data: attendanceData } = await supabase
        .from('attendance')
        .select('*')
        .eq('date', date)
        .in('student_id', inScopeStudentIds);

      const attMap: Record<string, any> = {};
      for (const att of attendanceData || []) {
        attMap[att.student_id] = att;
      }
      setAttendanceMap(attMap);

    } catch (err) {
      console.error('Error fetching attendance page data:', err);
    } finally {
      setLoading(false);
    }
  }, [profile, date]);

  useEffect(() => {
    fetchScopeData();
  }, [fetchScopeData]);

  const handleMarkAttendance = async (studentId: string, status: 'present' | 'absent' | 'late' | 'excused') => {
    if (!profile) return;
    setMarkingId(studentId);

    // Resolve teacher_id for the student
    const teacherId = studentTeacherMap[studentId] || fallbackTeacherId || profile.id;
    const existing = attendanceMap[studentId];

    try {
      if (existing) {
        // Update
        const { data, error } = await supabase
          .from('attendance')
          .update({ status })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        setAttendanceMap(prev => ({ ...prev, [studentId]: data }));
      } else {
        // Insert
        const { data, error } = await supabase
          .from('attendance')
          .insert({
            student_id: studentId,
            teacher_id: teacherId,
            status,
            date,
          })
          .select()
          .single();

        if (error) throw error;
        setAttendanceMap(prev => ({ ...prev, [studentId]: data }));
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update attendance');
    } finally {
      setMarkingId(null);
    }
  };

  const getStatusBadge = (status?: string) => {
    if (!status) return { text: 'Not Marked', bg: 'bg-slate-100', txtColor: 'text-slate-600' };
    switch (status) {
      case 'present': return { text: 'Present', bg: 'bg-green-100', txtColor: 'text-green-800' };
      case 'absent': return { text: 'Absent', bg: 'bg-red-100', txtColor: 'text-red-800' };
      case 'late': return { text: 'Late', bg: 'bg-amber-100', txtColor: 'text-amber-800' };
      case 'excused': return { text: 'Excused', bg: 'bg-blue-100', txtColor: 'text-blue-800' };
      default: return { text: status, bg: 'bg-slate-100', txtColor: 'text-slate-600' };
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas p-4">
      {/* Header */}
      <View className="mb-4">
        <Text className="text-2xl font-bold text-slate-900">Attendance Monitoring</Text>
        <Text className="text-slate-500 text-sm">View and update daily attendance logs</Text>
      </View>

      {/* Date selector */}
      <Card className="p-4 mb-4">
        <Text className="text-xs font-bold text-slate-700 mb-2">Select Date (YYYY-MM-DD)</Text>
        <View className="flex-row items-center gap-2">
          <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1">
            <Feather name="calendar" size={18} color="#64748B" />
            <TextInput
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94A3B8"
              className="flex-1 text-slate-800 text-sm ml-2"
              style={{ paddingVertical: Platform.OS === 'ios' ? 4 : 0 }}
            />
          </View>
          <Pressable
            onPress={() => setDate(new Date().toISOString().split('T')[0])}
            className="bg-slate-100 border border-slate-200 px-4 py-2.5 rounded-xl justify-center items-center"
          >
            <Text className="text-slate-700 font-semibold text-xs">Today</Text>
          </Pressable>
        </View>
      </Card>

      {/* Students List */}
      <FlatList
        data={students}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const currentRecord = attendanceMap[item.id];
          const badge = getStatusBadge(currentRecord?.status);
          const isProcessing = markingId === item.id;

          return (
            <Card className="mb-3 p-4">
              <View className="flex-row justify-between items-center">
                <View className="flex-1 mr-2">
                  <Text className="font-bold text-slate-900 text-base">{item.display_name}</Text>
                  {item.phone && <Text className="text-slate-400 text-xs mt-0.5">{item.phone}</Text>}
                </View>

                {isProcessing ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : (
                  <View className={`px-3 py-1 rounded-full ${badge.bg}`}>
                    <Text className={`text-xs font-bold ${badge.txtColor}`}>{badge.text}</Text>
                  </View>
                )}
              </View>

              {/* Attendance action buttons */}
              <View className="flex-row gap-2 mt-4 pt-3 border-t border-slate-100">
                {(['present', 'absent', 'late', 'excused'] as const).map(status => {
                  const isActive = currentRecord?.status === status;
                  let btnColor = 'bg-white border-slate-200';
                  let txtColor = 'text-slate-600';

                  if (isActive) {
                    if (status === 'present') {
                      btnColor = 'bg-green-500 border-green-500';
                      txtColor = 'text-white';
                    } else if (status === 'absent') {
                      btnColor = 'bg-red-500 border-red-500';
                      txtColor = 'text-white';
                    } else if (status === 'late') {
                      btnColor = 'bg-amber-500 border-amber-500';
                      txtColor = 'text-white';
                    } else {
                      btnColor = 'bg-blue-500 border-blue-500';
                      txtColor = 'text-white';
                    }
                  }

                  return (
                    <Pressable
                      key={status}
                      onPress={() => handleMarkAttendance(item.id, status)}
                      disabled={isProcessing}
                      className={`flex-1 py-2 rounded-xl border items-center justify-center ${btnColor}`}
                    >
                      <Text className={`text-xs font-bold capitalize ${txtColor}`}>{status}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View className="py-16 items-center justify-center">
            <Feather name="clipboard" size={48} color="#CBD5E1" />
            <Text className="text-slate-400 text-sm mt-3 font-medium">No assigned students found</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}
