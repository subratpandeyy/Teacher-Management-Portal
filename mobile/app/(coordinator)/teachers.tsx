import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, FlatList, ActivityIndicator, Alert, Platform } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CoordinatorTeachers() {
  const { profile } = useAuth();
  const [teachers, setTeachers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState<any | null>(null);

  // Detail states
  const [detailLoading, setDetailLoading] = useState(false);
  const [assignedStudents, setAssignedStudents] = useState<any[]>([]);
  const [availability, setAvailability] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);

  const fetchScopeTeachers = useCallback(async () => {
    if (!profile) return;
    try {
      // Find latest active assignments for all teachers to see which are in scope
      const { data: allAssigns } = await supabase
        .from('coordinator_assignments')
        .select('*')
        .order('created_at', { ascending: true });

      const latestTeacherMap = new Map();
      for (const a of allAssigns || []) {
        if (a.teacher_id) {
          latestTeacherMap.set(a.teacher_id, a.coordinator_id);
        }
      }

      const inScopeTeacherIds: string[] = [];
      latestTeacherMap.forEach((coordId, teacherId) => {
        if (coordId === profile.id) {
          inScopeTeacherIds.push(teacherId);
        }
      });

      if (inScopeTeacherIds.length === 0) {
        setTeachers([]);
        return;
      }

      const { data: teacherProfiles } = await supabase
        .from('profiles')
        .select('*')
        .in('id', inScopeTeacherIds)
        .is('deleted_at', null)
        .order('display_name');

      setTeachers(teacherProfiles || []);
    } catch (err) {
      console.error('Error fetching teachers:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchScopeTeachers();
  }, [fetchScopeTeachers]);

  const loadTeacherDetails = async (teacher: any) => {
    setSelectedTeacher(teacher);
    setDetailLoading(true);
    try {
      // 1. Fetch assigned students
      const { data: studentsData } = await supabase
        .from('teacher_student_assignments')
        .select(`
          id,
          student:profiles!teacher_student_assignments_student_id_fkey(id, display_name, phone)
        `)
        .eq('teacher_id', teacher.id);
      setAssignedStudents(studentsData || []);

      // 2. Fetch availability
      const { data: availabilityData } = await supabase
        .from('teacher_availability')
        .select('*')
        .eq('teacher_id', teacher.id)
        .order('created_at', { ascending: false });
      setAvailability(availabilityData || []);

      // 3. Fetch uploaded materials
      const { data: docsData } = await supabase
        .from('documents')
        .select('*')
        .eq('teacher_id', teacher.id)
        .eq('direction', 'teacher_to_admin')
        .order('created_at', { ascending: false });
      setDocuments(docsData || []);
    } catch (err) {
      console.error('Error loading teacher details:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = teachers.filter(t =>
    t.display_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  if (selectedTeacher) {
    return (
      <ScrollView className="flex-1 bg-canvas p-4" contentContainerStyle={{ paddingBottom: 60 }}>
        {/* Back button */}
        <Pressable
          onPress={() => setSelectedTeacher(null)}
          className="flex-row items-center gap-2 mb-4 bg-slate-100 p-2.5 rounded-xl self-start"
        >
          <Feather name="arrow-left" size={18} color="#475569" />
          <Text className="font-semibold text-slate-700">Back to teachers</Text>
        </Pressable>

        {/* Profile Details Card */}
        <Card className="p-5">
          <View className="flex-row items-center gap-4">
            <View className="h-16 w-16 rounded-full bg-emerald-50 items-center justify-center">
              <Text className="text-emerald-600 font-bold text-2xl">
                {selectedTeacher.display_name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-xl font-bold text-slate-900">{selectedTeacher.display_name}</Text>
              <Text className="text-slate-400 text-xs mt-0.5">Faculty / Teacher</Text>
              {selectedTeacher.email && <Text className="text-slate-500 text-xs mt-1">{selectedTeacher.email}</Text>}
              {selectedTeacher.phone && <Text className="text-slate-500 text-xs">{selectedTeacher.phone}</Text>}
            </View>
            <View className={`px-2.5 py-1 rounded-full ${selectedTeacher.status === 'active' ? 'bg-green-50' : 'bg-red-50'}`}>
              <Text className={`text-xs font-semibold uppercase ${selectedTeacher.status === 'active' ? 'text-blue-600' : 'text-red-600'}`}>
                {selectedTeacher.status}
              </Text>
            </View>
          </View>
        </Card>

        {detailLoading ? (
          <View className="py-12 items-center justify-center">
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : (
          <View className="space-y-6 mt-6">
            {/* Stats Overview */}
            <View className="flex-row gap-4">
              <Card className="flex-1 items-center py-4">
                <Text className="text-2xl font-bold text-slate-900">{assignedStudents.length}</Text>
                <Text className="text-xs text-slate-500 mt-1">Assigned Students</Text>
              </Card>
              <Card className="flex-1 items-center py-4">
                <Text className="text-2xl font-bold text-slate-900">{availability.length}</Text>
                <Text className="text-xs text-slate-500 mt-1">Availability Blocks</Text>
              </Card>
            </View>

            {/* Assigned Students */}
            <Card>
              <Text className="text-base font-bold text-slate-800 mb-3">Assigned Students</Text>
              <View className="space-y-2">
                {assignedStudents.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-1">No students assigned to this teacher</Text>
                ) : (
                  assignedStudents.map(item => (
                    <View key={item.id} className="flex-row items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <View>
                        <Text className="text-slate-800 font-semibold text-sm">{item.student?.display_name}</Text>
                        {item.student?.phone && <Text className="text-slate-400 text-xs mt-0.5">{item.student?.phone}</Text>}
                      </View>
                      <View className="h-8 w-8 rounded-full bg-blue-50 items-center justify-center">
                        <Feather name="user" size={16} color="#3B82F6" />
                      </View>
                    </View>
                  ))
                )}
              </View>
            </Card>

            {/* Teacher Availability */}
            <Card>
              <Text className="text-base font-bold text-slate-800 mb-3">Weekly & Special Availability</Text>
              <View className="space-y-2">
                {availability.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-1">No availability schedule set by teacher</Text>
                ) : (
                  availability.map(entry => (
                    <View key={entry.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <View className="flex-row justify-between items-center">
                        <Text className="font-semibold text-slate-800 text-sm">
                          {entry.kind === 'recurring_weekly' ? 'Weekly' : 'Specific Date Range'}
                        </Text>
                        <View className="px-2 py-0.5 rounded bg-emerald-50">
                          <Text className="text-emerald-700 text-xs font-medium">
                            {entry.start_time?.slice(0, 5)} - {entry.end_time?.slice(0, 5)}
                          </Text>
                        </View>
                      </View>

                      {entry.kind === 'recurring_weekly' ? (
                        <Text className="text-slate-600 text-xs mt-1">
                          Every {DAYS[entry.day_of_week ?? 0]}
                        </Text>
                      ) : (
                        <Text className="text-slate-600 text-xs mt-1">
                          From {entry.start_date} to {entry.end_date}
                        </Text>
                      )}

                      {entry.notes && (
                        <View className="mt-2 pt-2 border-t border-slate-200/60">
                          <Text className="text-slate-500 text-xs italic">Notes: {entry.notes}</Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            </Card>

            {/* Uploaded Materials */}
            <Card>
              <Text className="text-base font-bold text-slate-800 mb-3">Uploaded Materials</Text>
              <View className="space-y-2">
                {documents.length === 0 ? (
                  <Text className="text-xs text-slate-500 py-1">No materials uploaded by this teacher</Text>
                ) : (
                  documents.map(doc => (
                    <View key={doc.id} className="flex-row items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <View className="flex-1 mr-2">
                        <Text className="text-slate-800 font-semibold text-sm truncate" numberOfLines={1}>
                          {doc.title || doc.file_name}
                        </Text>
                        <Text className="text-slate-400 text-xs mt-0.5">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </Text>
                      </View>
                      <Feather name="file" size={20} color="#64748B" />
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
    <View className="flex-1 bg-canvas p-4">
      <View className="mb-4">
        <Text className="text-2xl font-bold text-slate-900">Faculty Management</Text>
        <Text className="text-slate-500 text-sm">Overview of teachers assigned to your scope</Text>
      </View>

      {/* Search Input */}
      <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 py-2.5 mb-4">
        <Feather name="search" size={20} color="#94A3B8" className="mr-2" />
        <TextInput
          placeholder="Search teachers by name or email..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94A3B8"
          className="flex-1 text-slate-800 text-sm ml-2"
          style={{ paddingVertical: Platform.OS === 'ios' ? 4 : 0 }}
        />
      </View>

      {/* Teachers List */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => loadTeacherDetails(item)}
            className="flex-row items-center justify-between bg-white p-4 rounded-2xl mb-3 border border-slate-100 shadow-sm"
          >
            <View className="flex-row items-center gap-3 flex-1">
              <View className="h-12 w-12 rounded-full bg-emerald-50 items-center justify-center">
                <Text className="text-emerald-600 font-bold text-lg">
                  {item.display_name?.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900 text-sm" numberOfLines={1}>
                  {item.display_name}
                </Text>
                <Text className="text-xs text-slate-400" numberOfLines={1}>
                  {item.email}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color="#94A3B8" />
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="py-12 items-center justify-center">
            <Feather name="award" size={48} color="#CBD5E1" />
            <Text className="text-slate-400 text-sm mt-3 font-medium">No assigned teachers found</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}
