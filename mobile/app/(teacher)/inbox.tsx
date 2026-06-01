import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../lib/auth';
import {
  fetchBroadcasts,
  fetchMyBroadcastFeedback,
  getSignedBroadcastAttachmentUrl,
  markBroadcastRead,
  submitBroadcastFeedback,
  type TeacherBroadcast,
} from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

export default function InboxScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [items, setItems] = useState<TeacherBroadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<TeacherBroadcast | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackByBroadcast, setFeedbackByBroadcast] = useState<Record<string, string>>({});
  const [savingFeedback, setSavingFeedback] = useState(false);
  const feedbackLoadSeq = useRef(0);

  const load = useCallback(async () => {
    setError('');
    const { data, error: err } = await fetchBroadcasts(teacherId);
    if (err) setError(err.message);
    else setItems(data ?? []);
  }, [teacherId]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`broadcasts:${teacherId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'broadcast_recipients',
          filter: `teacher_id=eq.${teacherId}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [teacherId, load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function openMessage(item: TeacherBroadcast) {
    setSelected(item);

    const cached = feedbackByBroadcast[item.broadcast_id];
    if (cached !== undefined) {
      setFeedback(cached);
    } else {
      setFeedback('');
    }

    if (!item.read_at) {
      await markBroadcastRead(item.recipient_id, teacherId);
      setItems((prev) =>
        prev.map((m) =>
          m.recipient_id === item.recipient_id ? { ...m, read_at: new Date().toISOString() } : m
        )
      );
    }

    const seq = ++feedbackLoadSeq.current;
    const { data } = await fetchMyBroadcastFeedback(teacherId, item.broadcast_id);
    if (seq !== feedbackLoadSeq.current) return;

    const text = data?.feedback_text ?? '';
    setFeedback(text);
    setFeedbackByBroadcast((prev) => ({ ...prev, [item.broadcast_id]: text }));
  }

  async function openAttachment(path: string) {
    const { url, error: err } = await getSignedBroadcastAttachmentUrl(path);
    if (url) await Linking.openURL(url);
    else setError(err?.message ?? 'Could not open attachment');
  }

  async function saveFeedback() {
    if (!selected || !feedback.trim()) return;
    setSavingFeedback(true);
    const broadcastId = selected.broadcast_id;
    const { error: err } = await submitBroadcastFeedback(teacherId, broadcastId, feedback.trim());
    setSavingFeedback(false);
    if (err) setError(err.message);
    else {
      setFeedbackByBroadcast((prev) => ({ ...prev, [broadcastId]: feedback.trim() }));
    }
  }

  function closeDetail() {
    feedbackLoadSeq.current += 1;
    setSelected(null);
    setFeedback('');
  }

  if (loading) return <LoadingScreen label="Loading messages…" />;

  if (selected) {
    return (
      <View className="flex-1 bg-slate-50 p-4">
        <Pressable onPress={closeDetail} className="mb-4">
          <Text className="text-brand-600">← Back</Text>
        </Pressable>
        <Text className="text-xl font-bold text-slate-900">{selected.title}</Text>
        <Text className="mt-1 text-xs text-slate-500">
          {new Date(selected.published_at).toLocaleString()}
        </Text>
        <Text className="mt-4 text-base leading-6 text-slate-700">{selected.message}</Text>
        {(selected.attachments?.length
          ? selected.attachments
          : selected.attachment_url
            ? [
                {
                  storage_path: selected.attachment_url,
                  file_name: selected.attachment_name ?? 'Attachment',
                  id: 'legacy',
                  mime_type: null,
                },
              ]
            : []
        ).map((att) => (
          <Pressable key={att.id} className="mt-3" onPress={() => openAttachment(att.storage_path)}>
            <Text className="text-brand-600">📎 {att.file_name}</Text>
          </Pressable>
        ))}
        <View className="mt-6">
          <Text className="mb-2 font-semibold text-slate-800">Your feedback</Text>
          <TextInput
            className="min-h-[80px] rounded-xl border border-slate-200 bg-white p-3"
            multiline
            value={feedback}
            onChangeText={setFeedback}
            placeholder="Reply to this broadcast…"
          />
          <Pressable
            onPress={saveFeedback}
            disabled={savingFeedback}
            className="mt-3 items-center rounded-xl bg-brand-600 py-3 disabled:opacity-50"
          >
            <Text className="font-semibold text-white">
              {savingFeedback ? 'Saving…' : 'Submit feedback'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.recipient_id}
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
                className={`flex-1 text-base ${item.read_at ? 'text-slate-700' : 'font-semibold text-slate-900'}`}
                numberOfLines={1}
              >
                {item.title}
              </Text>
              {!item.read_at ? <View className="ml-2 h-2 w-2 rounded-full bg-brand-600" /> : null}
            </View>
            <Text className="mt-1 text-sm text-slate-500" numberOfLines={2}>
              {item.message}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}
