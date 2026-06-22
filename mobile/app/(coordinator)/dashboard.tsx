import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Card } from '../../components/ui/Card';
import { SearchBar } from '../../components/ui/SearchBar';

export default function CoordinatorDashboard() {
  const { profile } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [stats, setStats] = useState({
    teacherCount: 0,
    studentCount: 0,
    pendingTasks: 0,
    dailyReportSubmitted: false
  });

  const fetchDashboardData = useCallback(async () => {
    if (!profile) return;
    try {
      // 1. Get coordinator assignments
      const { data: assignments } = await supabase
        .from('coordinator_assignments')
        .select('teacher_id, student_id')
        .eq('coordinator_id', profile.id);

      // Resolve active assignments by sorting/mapping (older overwriting is resolved in client mapping)
      // Since coordinator_assignments is chronological, we filter for unique latest per teacher/student
      const activeTeachers = new Set();
      const activeStudents = new Set();
      
      const { data: allAssigns } = await supabase
        .from('coordinator_assignments')
        .select('*')
        .order('created_at', { ascending: true });

      const latestTeacherMap = new Map();
      const latestStudentMap = new Map();

      for (const a of allAssigns || []) {
        if (a.teacher_id) latestTeacherMap.set(a.teacher_id, a.coordinator_id);
        if (a.student_id) latestStudentMap.set(a.student_id, a.coordinator_id);
      }

      latestTeacherMap.forEach((coordId, teacherId) => {
        if (coordId === profile.id) activeTeachers.add(teacherId);
      });

      latestStudentMap.forEach((coordId, studentId) => {
        if (coordId === profile.id) activeStudents.add(studentId);
      });

      // 2. Get pending tasks
      const { count: taskCount } = await supabase
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('assigned_by', profile.id)
        .eq('status', 'pending');

      // 3. Get today's daily report
      const today = new Date().toISOString().split('T')[0];
      const { data: report } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('coordinator_id', profile.id)
        .eq('date', today)
        .maybeSingle();

      setStats({
        teacherCount: activeTeachers.size,
        studentCount: activeStudents.size,
        pendingTasks: taskCount || 0,
        dailyReportSubmitted: !!report
      });
    } catch (err) {
      console.error('Error loading coordinator dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  if (loading) return <LoadingScreen label="Loading dashboard..." />;

  return (
    <ScrollView 
      className="flex-1 bg-slate-50 p-4"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
    >
      <View className="mb-6">
        <Text className="text-2xl font-bold text-slate-900">Welcome, {profile?.display_name}</Text>
        <Text className="text-slate-500">Coordinator Dashboard</Text>
      </View>

      <SearchBar userId={profile!.id} />

      {/* Metrics Row */}
      <View className="flex-row flex-wrap gap-4">
        <Card className="flex-1 min-w-[45%] items-center py-5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Feather name="award" size={24} color="#2563EB" />
          </View>
          <Text className="mt-3 text-2xl font-bold text-slate-900">{stats.teacherCount}</Text>
          <Text className="text-xs text-slate-500">Assigned Teachers</Text>
        </Card>

        <Card className="flex-1 min-w-[45%] items-center py-5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Feather name="users" size={24} color="#3B82F6" />
          </View>
          <Text className="mt-3 text-2xl font-bold text-slate-900">{stats.studentCount}</Text>
          <Text className="text-xs text-slate-500">Assigned Students</Text>
        </Card>

        <Card className="flex-1 min-w-[45%] items-center py-5">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <Feather name="check-square" size={24} color="#F59E0B" />
          </View>
          <Text className="mt-3 text-2xl font-bold text-slate-900">{stats.pendingTasks}</Text>
          <Text className="text-xs text-slate-500">Pending Tasks</Text>
        </Card>

        <Card className="flex-1 min-w-[45%] items-center py-5">
          <View className={`h-12 w-12 items-center justify-center rounded-full ${stats.dailyReportSubmitted ? 'bg-green-50' : 'bg-rose-50'}`}>
            <Feather name="file-text" size={24} color={stats.dailyReportSubmitted ? '#2563EB' : '#EF4444'} />
          </View>
          <Text className="mt-3 text-sm font-bold text-slate-900 text-center px-1">
            {stats.dailyReportSubmitted ? 'Submitted' : 'Pending'}
          </Text>
          <Text className="text-xs text-slate-500 mt-1">Daily Target Report</Text>
        </Card>
      </View>

      {/* Quick Actions */}
      <View className="mt-8 space-y-4">
        <Text className="text-lg font-bold text-slate-900">Quick Actions</Text>

        <Pressable
          onPress={() => router.push('/(coordinator)/students' as any)}
          className="flex-row items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Feather name="users" size={20} color="#3B82F6" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">Manage Students</Text>
            <Text className="text-xs text-slate-500">Track progress, attendance, and details</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(coordinator)/teachers' as any)}
          className="flex-row items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Feather name="award" size={20} color="#2563EB" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">Faculty Overview</Text>
            <Text className="text-xs text-slate-500">Monitor teacher performance and activity</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(coordinator)/work' as any)}
          className="flex-row items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Feather name="trending-up" size={20} color="#8B5CF6" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">Work Tracking</Text>
            <Text className="text-xs text-slate-500">Submit daily completion targets & log work</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(coordinator)/chat' as any)}
          className="flex-row items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-50">
            <Feather name="message-square" size={20} color="#6366F1" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">Communication Center</Text>
            <Text className="text-xs text-slate-500">Chat with teachers, students, and admin</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>
      </View>
    </ScrollView>
  );
}
