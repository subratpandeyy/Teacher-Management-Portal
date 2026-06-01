import { ActivityIndicator, Text, View } from 'react-native';

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-canvas">
      <View className="items-center rounded-2xl bg-white px-8 py-6 shadow-sm">
        <ActivityIndicator size="large" color="#22C55E" />
        <Text className="mt-3 text-sm text-slate-600">{label}</Text>
      </View>
    </View>
  );
}
