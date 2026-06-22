import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ScrollView, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Card } from '../../components/ui/Card';
import { SearchBar } from '../../components/ui/SearchBar';

type StatCardProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
};

function StatCard({ icon, iconBg, iconColor, value, label }: StatCardProps) {
  return (
    <Card className="flex-1 min-w-[45%] items-center py-5">
      <View
        className="h-12 w-12 items-center justify-center rounded-xl"
        style={{ backgroundColor: iconBg }}
      >
        <Feather name={icon} size={22} color={iconColor} />
      </View>
      <Text className="mt-3 text-2xl font-bold text-slate-900">{value}</Text>
      <Text className="mt-0.5 text-xs font-medium text-slate-500">{label}</Text>
    </Card>
  );
}

type ActionCardProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  onPress: () => void;
};

function ActionCard({ icon, iconBg, iconColor, title, description, onPress }: ActionCardProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-4 rounded-2xl border border-slate-100 bg-white p-4 active:bg-slate-50"
      style={{
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      <View className="h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: iconBg }}>
        <Feather name={icon} size={22} color={iconColor} />
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-slate-900">{title}</Text>
        <Text className="mt-0.5 text-xs text-slate-500">{description}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#CBD5E1" />
    </Pressable>
  );
}

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
    <ScrollView className="flex-1 bg-slate-50" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
      <View className="mb-6">
        <Text className="text-2xl font-bold text-slate-900">
          Hello, {profile?.display_name}!
        </Text>
        <Text className="mt-1 text-sm text-slate-500">
          Here's your progress overview.
        </Text>
      </View>

      <SearchBar userId={profile!.id} />

      <View className="flex-row flex-wrap gap-4">
        <StatCard
          icon="check-circle"
          iconBg="#EEF2FF"
          iconColor="#4F46E5"
          value={`${stats.attendanceRate}%`}
          label="Attendance"
        />
        <StatCard
          icon="trending-up"
          iconBg="#EFF6FF"
          iconColor="#3B82F6"
          value={`${stats.overallProgress}%`}
          label="Progress"
        />
        <StatCard
          icon="clipboard"
          iconBg="#FFF7ED"
          iconColor="#F97316"
          value={`${stats.upcomingTasks}`}
          label="Pending Tasks"
        />
      </View>

      <View className="mt-8">
        <Text className="mb-4 text-lg font-bold text-slate-900">Quick Actions</Text>
        <View className="gap-3">
          <ActionCard
            icon="message-square"
            iconBg="#EEF2FF"
            iconColor="#4F46E5"
            title="Chat with Coordinator"
            description="Message your assigned coordinator"
            onPress={() => router.push('/(student)/chat')}
          />
          <ActionCard
            icon="book-open"
            iconBg="#FFF7ED"
            iconColor="#F97316"
            title="My Materials"
            description="Access study documents"
            onPress={() => router.push('/(teacher)/documents')}
          />
        </View>
      </View>
    </ScrollView>
  );
}
