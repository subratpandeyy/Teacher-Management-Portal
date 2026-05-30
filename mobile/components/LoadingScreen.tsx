import { ActivityIndicator, Text, View } from 'react-native';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50">
      <ActivityIndicator size="large" color="#2563eb" />
      <Text className="mt-3 text-slate-600">{label}</Text>
    </View>
  );
}
