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
    <View className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
      <Text className="text-sm text-red-800">{message}</Text>
      {onDismiss ? (
        <Pressable onPress={onDismiss} className="mt-1">
          <Text className="text-xs font-semibold text-red-600">Dismiss</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
