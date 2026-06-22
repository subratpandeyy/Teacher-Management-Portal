import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { Card } from '../../components/ui/Card';

export default function ProfileScreen() {
  const { user, profile, signOut } = useAuth();
  const role = profile?.role ?? 'teacher';
  const initial = (profile?.display_name ?? user?.email ?? 'T').charAt(0).toUpperCase();

  return (
    <View className="flex-1 bg-slate-50">
      <View className="px-4 pt-4">
        <Card className="items-center py-6">
          <View className="mb-4 h-20 w-20 items-center justify-center rounded-full bg-blue-100">
            <Text className="text-3xl font-bold text-blue-600">{initial}</Text>
          </View>
          <Text className="text-xl font-bold text-slate-900">
            {profile?.display_name ?? 'User'}
          </Text>
          <Text className="mt-1 text-sm text-slate-500">{user?.email}</Text>
          <View className="mt-3 rounded-full bg-blue-50 px-4 py-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-blue-600">
              {role} account
            </Text>
          </View>
        </Card>

        <View className="mt-4 gap-2">
          <View className="flex-row items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
            <Feather name="mail" size={18} color="#3B82F6" />
            <View className="flex-1">
              <Text className="text-xs text-slate-500">Email</Text>
              <Text className="text-sm font-medium text-slate-800">{user?.email}</Text>
            </View>
          </View>
          <View className="flex-row items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3.5">
            <Feather name="user" size={18} color="#2563EB" />
            <View className="flex-1">
              <Text className="text-xs text-slate-500">Display name</Text>
              <Text className="text-sm font-medium text-slate-800">
                {profile?.display_name ?? '—'}
              </Text>
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => signOut()}
          className="mt-6 flex-row items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 py-3.5 active:bg-red-100"
        >
          <Feather name="log-out" size={18} color="#DC2626" />
          <Text className="font-semibold text-red-600">Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
