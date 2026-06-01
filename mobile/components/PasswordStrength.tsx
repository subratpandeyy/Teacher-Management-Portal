import { Text, View } from 'react-native';

function score(password: string): number {
  let s = 0;
  if (password.length >= 8) s++;
  if (password.length >= 12) s++;
  if (/[A-Z]/.test(password)) s++;
  if (/[0-9]/.test(password)) s++;
  if (/[^A-Za-z0-9]/.test(password)) s++;
  return Math.min(s, 4);
}

const LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'];
const COLORS = ['#EF4444', '#F97316', '#EAB308', '#22C55E', '#16A34A'];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const s = score(password);
  return (
    <View className="mt-2">
      <View className="flex-row gap-1">
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ backgroundColor: i <= s ? COLORS[s] : '#E2E8F0' }}
          />
        ))}
      </View>
      <Text className="mt-1 text-xs text-slate-500">{LABELS[s]}</Text>
    </View>
  );
}
