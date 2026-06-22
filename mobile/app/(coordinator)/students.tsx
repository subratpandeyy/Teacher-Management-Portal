import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Picker } from '../../components/ui/Picker';

export default function CoordinatorStudents() {
  const { profile } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  
  // Student detail state
  const [detailLoading, setDetailLoading] = useState(false);
  const [progressLog, setProgressLog] = useState<any[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [assignedTeachers, setAssignedTeachers] = useState<any[]>([]);
  const [scopeTeachers, setScopeTeachers] = useState<any[]>([]);
  const [assigningTeacherId, setAssigningTeacherId] = useState('');

  const fetchScopeStudents = useCallback(async () => {
    if (!profile) return;
    try {
      // Get all coordinator assignments to find active assignments in scope
      const { data: allAssigns } = await supabase
        .from('coordinator_assignments')
        .select('*')
        .order('created_at', { ascending: true });

      const latestStudentMap = new Map();
      for (const a of allAssigns || []) {
        if (a.student_id) {
          latestStudentMap.set(a.student_id, a.coordinator_id);
        }
      }

      const inScopeStudentIds: string[] = [];
      latestStudentMap.forEach((coordId, studentId) => {
        if (coordId === profile.id) {
          inScopeStudentIds.push(studentId);
        }
      });

      if (inScopeStudentIds.length === 0) {
        setStudents([]);
        return;
      }

      // Fetch profiles of these student IDs
      const { data: studentProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', inScopeStudentIds)
        .is('deleted_at', null)
        .order('display_name');

      setStudents(studentProfiles || []);
    } catch (err) {
      console.error('Error fetching students:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchScopeStudents();
  }, [fetchScopeStudents]);

  const loadStudentDetails = async (student: any) => {
    setSelectedStudent(student);
    setDetailLoading(true);
    try {
      // 1. Fetch progress logs
      const { data: progress } = await supabase
        .from('student_progress')
        .select('*')
        .eq('student_id', student.id)
        .order('updated_at', { ascending: false });
      setProgressLog(progress || []);

      // 2. Fetch attendance
      const { data: attendance } = await supabase
        .from('attendance')
        .select('*')
        .eq('student_id', student.id)
        .order('date', { ascending: false });
      setAttendanceRecords(attendance || []);

      // 3. Fetch current assigned teachers
      const { data: currentTeachers } = await supabase
        .from('teacher_student_assignments')
        .select(`
          id,
          teacher:profiles!teacher_student_assignments_teacher_id_fkey(id, display_name)
        `)
        .eq('student_id', student.id);
      setAssignedTeachers(currentTeachers || []);

      // 4. Fetch teachers in coordinator scope to assign
      const { data: allAssigns } = await supabase
        .from('coordinator_assignments')
        .select('*')
        .order('created_at', { ascending: true });

      const latestTeacherMap = new Map();
      for (const a of allAssigns || []) {
        if (a.teacher_id) latestTeacherMap.set(a.teacher_id, a.coordinator_id);
      }

      const inScopeTeacherIds: string[] = [];
      latestTeacherMap.forEach((coordId, teacherId) => {
        if (coordId === profile!.id) inScopeTeacherIds.push(teacherId);
      });

      if (inScopeTeacherIds.length > 0) {
        const { data: scopeTeachersData } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', inScopeTeacherIds)
          .is('deleted_at', null);
        setScopeTeachers(scopeTeachersData || []);
        if (scopeTeachersData?.length) setAssigningTeacherId(scopeTeachersData[0].id);
      } else {
        setScopeTeachers([]);
      }
    } catch (err) {
      console.error('Error fetching student details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAssignTeacher = async () => {
    if (!selectedStudent || !assigningTeacherId || !profile) return;
    try {
      const { error } = await supabase
        .from('teacher_student_assignments')
        .insert({
          teacher_id: assigningTeacherId,
          student_id: selectedStudent.id,
          assigned_by: profile.id,
          assigned_by_role: 'coordinator'
        });

      if (error) throw error;
      Alert.alert('Success', 'Teacher assigned successfully');
      loadStudentDetails(selectedStudent);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to assign teacher');
    }
  };

  const handleRemoveTeacher = async (assignId: string) => {
    Alert.alert(
      'Remove Assignment',
      'Are you sure you want to remove this teacher assignment?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('teacher_student_assignments')
                .delete()
                .eq('id', assignId);
              if (error) throw error;
              loadStudentDetails(selectedStudent);
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to remove assignment');
            }
          }
        }
      ]
    );
  };

  const filtered = students.filter(s => 
    s.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (selectedStudent) {
    const presentCount = attendanceRecords.filter(r => r.status === 'present').length;
    const rate = attendanceRecords.length > 0 ? Math.round((presentCount / attendanceRecords.length) * 100) : 0;
    
    return (
      <ScrollView className="flex-1 bg-slate-50 p-4">
        {/* Back header */}
        <Pressable 
          onPress={() => setSelectedStudent(null)} 
          className="flex-row items-center gap-2 mb-4 bg-slate-100 p-2.5 rounded-xl self-start"
        >
          <Feather name="arrow-left" size={18} color="#475569" />
          <Text className="font-semibold text-slate-700">Back to students</Text>
        </Pressable>

        {/* Profile Card */}
        <Card className="p-5">
          <View className="flex-row items-center gap-4">
            <View className="h-16 w-16 rounded-full bg-blue-50 items-center justify-center">
              <Text className="text-blue-600 font-bold text-2xl">
                {selectedStudent.display_name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text className="text-xl font-bold text-slate-900">{selectedStudent.display_name}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Student</Text>
              {selectedStudent.phone && <Text className="text-slate-500 text-xs mt-1">{selectedStudent.phone}</Text>}
            </View>
          </View>
        </Card>

        {detailLoading ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <View className="space-y-6 mt-6 pb-12">
            {/* Stats Row */}
            <View className="flex-row gap-4">
              <Card className="flex-1 items-center py-4">
                <Text className="text-2xl font-bold text-slate-900">{rate}%</Text>
                <Text className="text-xs text-slate-500 mt-1">Attendance Rate</Text>
              </Card>
              <Card className="flex-1 items-center py-4">
                <Text className="text-2xl font-bold text-slate-900">
                  {progressLog.length > 0 ? `${progressLog[0].completion_percentage}%` : '0%'}
                </Text>
                <Text className="text-xs text-slate-500 mt-1">Latest Progress</Text>
              </Card>
            </View>

            {/* Teacher Assignment Management */}
            <Card>
              <Text className="text-base font-bold text-slate-800 mb-3">Assigned Faculty (Teachers)</Text>
              <View className="space-y-2">
                {assignedTeachers.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-1">No teachers assigned to this student</Text>
                ) : (
                  assignedTeachers.map(att => (
                    <View key={att.id} className="flex-row items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <Text className="text-slate-800 font-medium text-sm">{att.teacher?.display_name}</Text>
                      <Pressable onPress={() => handleRemoveTeacher(att.id)}>
                        <Feather name="trash-2" size={16} color="#EF4444" />
                      </Pressable>
                    </View>
                  ))
                )}

                {scopeTeachers.length > 0 && (
                  <View className="pt-4 mt-2 border-t border-slate-100 space-y-3">
                    <Text className="text-xs font-bold text-slate-500">Assign New Teacher</Text>
                    <View className="flex-row gap-2 items-center">
                      <Picker
                        options={scopeTeachers.map(t => ({ label: t.display_name, value: t.id }))}
                        selectedValue={assigningTeacherId}
                        onValueChange={setAssigningTeacherId}
                        placeholder="Choose teacher"
                      />
                      <Pressable 
                        onPress={handleAssignTeacher}
                        className="bg-blue-500 px-4 h-11 items-center justify-center rounded-xl"
                      >
                        <Text className="text-white font-bold text-sm">Assign</Text>
                      </Pressable>
                    </View>
                  </View>
                )}
              </View>
            </Card>

            {/* Attendance Log */}
            <Card>
              <Text className="text-base font-bold text-slate-800 mb-3">Attendance History</Text>
              <View className="space-y-2">
                {attendanceRecords.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-1">No attendance logs found</Text>
                ) : (
                  attendanceRecords.map(rec => (
                    <View key={rec.id} className="flex-row items-center justify-between border-b border-slate-50 py-2">
                      <Text className="text-sm text-slate-700">{rec.date}</Text>
                      <View className={`px-2.5 py-0.5 rounded-full ${
                        rec.status === 'present' ? 'bg-blue-100 text-blue-800' :
                        rec.status === 'late' ? 'bg-amber-100 text-amber-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        <Text className="text-xs font-bold capitalize">{rec.status}</Text>
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Card>

            {/* Progress Log */}
            <Card>
              <Text className="text-base font-bold text-slate-800 mb-3">Progress Reports</Text>
              <View className="space-y-3">
                {progressLog.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-1">No progress updates yet</Text>
                ) : (
                  progressLog.map(p => (
                    <View key={p.id} className="border-b border-slate-50 pb-2 space-y-1">
                      <View className="flex-row justify-between">
                        <Text className="text-sm font-semibold text-slate-800">{p.subject}</Text>
                        <Text className="text-sm font-bold text-blue-600">{p.completion_percentage}%</Text>
                      </View>
                      {p.remarks && <Text className="text-xs text-slate-500 italic mt-0.5">"{p.remarks}"</Text>}
                    </View>
                  ))
                )}
              </View>
            </Card>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      {/* Search Header */}
      <View className="bg-white px-4 pt-3 pb-4 border-b border-slate-100">
        <Text className="text-lg font-bold text-slate-900 mb-3">Student Directory</Text>
        <View className="flex-row items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Feather name="search" size={18} color="#94A3B8" />
          <TextInput
            placeholder="Search students..."
            value={search}
            onChangeText={setSearch}
            className="flex-1 ml-2 text-base text-slate-800 py-1"
          />
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerClassName="p-4"
        ListEmptyComponent={
          <View className="items-center py-12">
            <Text className="text-slate-500">No students assigned to you</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => loadStudentDetails(item)} className="mb-3">
            <Card className="flex-row items-center justify-between p-4">
              <View className="flex-row items-center gap-3">
                <View className="h-10 w-10 rounded-full bg-blue-50 items-center justify-center">
                  <Text className="text-blue-600 font-bold">
                    {item.display_name?.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text className="font-bold text-slate-900">{item.display_name}</Text>
                  {item.phone && <Text className="text-xs text-slate-500 mt-0.5">{item.phone}</Text>}
                </View>
              </View>
              <Feather name="chevron-right" size={20} color="#CBD5E1" />
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
