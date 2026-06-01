import { Feather } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string;
  onDismiss?: () => void;
}) {
  if (!message) return null;
  return (
    <View className="mx-4 mb-3 flex-row items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5">
      <Feather name="alert-circle" size={18} color="#DC2626" style={{ marginTop: 1 }} />
      <View className="flex-1">
        <Text className="text-sm text-red-800">{message}</Text>
        {onDismiss ? (
          <Pressable onPress={onDismiss} className="mt-1">
            <Text className="text-xs font-semibold text-red-600">Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
