import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Card } from '../../components/ui/Card';

export default function StudentDashboard() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({
    attendanceRate: 0,
    overallProgress: 0,
    upcomingTasks: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) {
      setLoading(false);
      return;
    }

    async function fetchStudentData() {
      try {
        const [attendance, progress, tasks] = await Promise.all([
          supabase.from('attendance').select('status').eq('student_id', profile!.id),
          supabase.from('student_progress').select('completion_percentage').eq('student_id', profile!.id),
          supabase.from('tasks').select('id').eq('assigned_to', profile!.id).eq('status', 'pending'),
        ]);

        const totalAttendance = attendance.data?.length || 0;
        const presentCount = attendance.data?.filter(a => a.status === 'present').length || 0;
        
        const avgProgress = progress.data?.length 
          ? Math.round(progress.data.reduce((acc, curr) => acc + curr.completion_percentage, 0) / progress.data.length)
          : 0;

        setStats({
          attendanceRate: totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0,
          overallProgress: avgProgress,
          upcomingTasks: tasks.data?.length || 0,
        });
      } catch (err) {
        console.error('Error fetching student data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStudentData();
  }, [profile]);

  if (loading) return <LoadingScreen label="Loading your progress..." />;

  return (
    <ScrollView className="flex-1 bg-canvas p-4">
      <View className="mb-6">
        <Text className="text-2xl font-bold text-slate-900">Hello, {profile?.display_name}!</Text>
        <Text className="text-slate-500">Here's your progress overview.</Text>
      </View>

      <View className="flex-row flex-wrap gap-4">
        <Card className="w-[47%] items-center py-6">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
            <Feather name="check-circle" size={24} color="#10B981" />
          </View>
          <Text className="mt-3 text-2xl font-bold text-slate-900">{stats.attendanceRate}%</Text>
          <Text className="text-xs text-slate-500">Attendance</Text>
        </Card>

        <Card className="w-[47%] items-center py-6">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-50">
            <Feather name="trending-up" size={24} color="#3B82F6" />
          </View>
          <Text className="mt-3 text-2xl font-bold text-slate-900">{stats.overallProgress}%</Text>
          <Text className="text-xs text-slate-500">Progress</Text>
        </Card>

        <Card className="w-[47%] items-center py-6">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-amber-50">
            <Feather name="clipboard" size={24} color="#F59E0B" />
          </View>
          <Text className="mt-3 text-2xl font-bold text-slate-900">{stats.upcomingTasks}</Text>
          <Text className="text-xs text-slate-500">Pending Tasks</Text>
        </Card>
      </View>

      <View className="mt-8 space-y-4">
        <Text className="text-lg font-bold text-slate-900">Quick Actions</Text>
        <Pressable
          onPress={() => router.push('/(teacher)/chat')}
          className="flex-row items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-purple-50">
            <Feather name="message-square" size={20} color="#8B5CF6" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">Chat with Admin</Text>
            <Text className="text-xs text-slate-500">Get support or ask questions</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>

        <Pressable
          onPress={() => router.push('/(teacher)/documents')}
          className="flex-row items-center gap-4 rounded-2xl bg-white p-4 shadow-sm"
        >
          <View className="h-10 w-10 items-center justify-center rounded-xl bg-orange-50">
            <Feather name="book-open" size={20} color="#F97316" />
          </View>
          <View className="flex-1">
            <Text className="font-semibold text-slate-900">My Materials</Text>
            <Text className="text-xs text-slate-500">Access study documents</Text>
          </View>
          <Feather name="chevron-right" size={20} color="#94A3B8" />
        </Pressable>
      </View>
    </ScrollView>
  );
}
