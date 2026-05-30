import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import { fetchInbox, markInboxRead } from '../../lib/api';
import type { InboxMessage } from '../../lib/supabase';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

export default function InboxScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [items, setItems] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<InboxMessage | null>(null);

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await fetchInbox(teacherId);
    if (err) setError(err.message);
    else setItems((data as InboxMessage[]) ?? []);
  }, [teacherId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openMessage(item: InboxMessage) {
    setSelected(item);
    if (!item.is_read) {
      await markInboxRead(teacherId, item.id);
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, is_read: true } : m))
      );
    }
  }

  if (loading) return <LoadingScreen label="Loading inbox…" />;

  if (selected) {
    return (
      <View className="flex-1 bg-slate-50 p-4">
        <Pressable onPress={() => setSelected(null)} className="mb-4">
          <Text className="text-brand-600">← Back</Text>
        </Pressable>
        <Text className="text-xl font-bold text-slate-900">{selected.subject}</Text>
        <Text className="mt-1 text-xs text-slate-500">
          {new Date(selected.created_at).toLocaleString()}
        </Text>
        <Text className="mt-4 text-base leading-6 text-slate-700">{selected.body}</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text className="p-8 text-center text-slate-500">No messages yet.</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openMessage(item)}
            className="border-b border-slate-100 bg-white px-4 py-4"
          >
            <View className="flex-row items-center justify-between">
              <Text
                className={`flex-1 text-base ${item.is_read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}
                numberOfLines={1}
              >
                {item.subject}
              </Text>
              {!item.is_read ? (
                <View className="ml-2 h-2 w-2 rounded-full bg-brand-600" />
              ) : null}
            </View>
            <Text className="mt-1 text-sm text-slate-500" numberOfLines={2}>
              {item.body}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
