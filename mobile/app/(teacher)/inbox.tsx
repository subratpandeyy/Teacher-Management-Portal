import { Feather, Octicons } from '@expo/vector-icons';
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
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';

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

  const broadcastSubId = useRef(0);

  useEffect(() => {
    const id = ++broadcastSubId.current;
    const channel = supabase
      .channel(`broadcasts:${teacherId}:${id}`)
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
      .subscribe((status) => {
        console.log(`Channel broadcasts:${teacherId}:${id} status:`, status);
      });

    return () => {
      console.log(`Removing channel broadcasts:${teacherId}:${id}`);
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
      <View className="flex-1 bg-canvas">
        <View className="px-4 pt-3">
          <Pressable onPress={closeDetail} className="mb-3 flex-row items-center gap-1 self-end p-2 rounded-xl bg-gray-600">
            <Feather name="arrow-left" size={18} color="white" />
            <Text className="font-medium text-white">Back to inbox</Text>
          </Pressable>
          <Card>
            <View className="mb-2 flex-row items-start gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-accent-blue-50">
                <Feather name="volume-2" size={20} color="#2563EB" />
              </View>
              <View className="flex-1">
                <Text className="text-lg font-bold text-slate-900">{selected.title}</Text>
                <Text className="mt-0.5 text-xs text-slate-500">
                  {new Date(selected.published_at).toLocaleString()}
                </Text>
              </View>
            </View>
            <Text className="text-base leading-6 text-slate-700">{selected.message}</Text>
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
              <Pressable
                key={att.id}
                className="mt-3 flex-row items-center gap-2 rounded-xl bg-accent-blue-50 px-3 py-2.5"
                onPress={() => openAttachment(att.storage_path)}
              >
                <Feather name="paperclip" size={16} color="#3B82F6" />
                <Text className="flex-1 font-medium text-accent-blue-600">{att.file_name}</Text>
                <Feather name="download" size={16} color="#3B82F6" />
              </Pressable>
            ))}
          </Card>

          <Card className="mt-4">
            <Text className="mb-2 font-semibold text-slate-800">Your feedback</Text>
            <TextInput
              className="min-h-[100px] rounded-xl border border-slate-200 bg-slate-50 p-3 text-base text-slate-800"
              multiline
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Reply to this broadcast…"
              placeholderTextColor="#94A3B8"
            />
            <Pressable
              onPress={saveFeedback}
              disabled={savingFeedback}
              className="mt-3 items-center rounded-xl bg-accent-blue-500 py-3 disabled:opacity-50"
            >
              <Text className="font-semibold text-white">
                {savingFeedback ? 'Saving…' : 'Submit feedback'}
              </Text>
            </Pressable>
          </Card>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="border-b border-slate-100 bg-white px-4 py-2.5">
        <View className="flex-row items-center gap-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-blue-400">
          <Octicons name="broadcast" size={24} color="white" />
          </View>
          <View>
            <Text className="font-semibold text-slate-900">Inbox</Text>
            <Text className="text-xs text-slate-500">Broadcasts from your administrator</Text>
          </View>
        </View>
      </View>
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        data={items}
        keyExtractor={(item) => item.recipient_id}
        contentContainerClassName="px-4 py-3 pb-6"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#22C55E" />}
        ListEmptyComponent={
          <EmptyState
            icon="inbox"
            title="No broadcasts yet"
            description="Messages from your administrator will appear here."
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openMessage(item)} className="mb-3">
            <Card className={!item.read_at ? 'border-accent-green-200' : ''}>
              <View className="flex-row items-start gap-3">
                <View
                  className={`h-11 w-11 items-center justify-center rounded-xl ${item.read_at ? 'bg-slate-100' : 'bg-accent-green-100'}`}
                >
                  <Feather name="volume-2" size={20} color={item.read_at ? '#64748B' : '#22C55E'} />
                </View>
                <View className="flex-1">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text
                      className={`flex-1 text-base ${item.read_at ? 'text-slate-700' : 'font-bold text-slate-900'}`}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    {!item.read_at ? (
                      <View className="rounded-full bg-accent-green-500 px-2 py-0.5">
                        <Text className="text-[10px] font-bold text-white">NEW</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text className="mt-1 text-xs text-slate-400">
                    {new Date(item.published_at).toLocaleString()}
                  </Text>
                  <Text className="mt-2 text-sm leading-5 text-slate-600" numberOfLines={2}>
                    {item.message}
                  </Text>
                </View>
                <Feather name="chevron-right" size={18} color="#CBD5E1" />
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
