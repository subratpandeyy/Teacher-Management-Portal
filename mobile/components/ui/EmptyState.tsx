import { Feather } from '@expo/vector-icons';
import { Text, View } from 'react-native';

type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

export function EmptyState({
  icon = 'inbox',
  title,
  description,
}: {
  icon?: FeatherIconName;
  title: string;
  description?: string;
}) {
  return (
    <View className="items-center px-8 py-12">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
        <Feather name={icon} size={28} color="#3B82F6" />
      </View>
      <Text className="text-center text-base font-semibold text-slate-800">{title}</Text>
      {description ? (
        <Text className="mt-2 text-center text-sm leading-5 text-slate-500">{description}</Text>
      ) : null}
    </View>
  );
}
