import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import {
  fetchChatMessages,
  getOrCreateConversation,
  sendChatMessage,
} from '../../lib/api';
import type { ChatMessage, Conversation } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';

export default function ChatScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const { data, error: err } = await fetchChatMessages(conversationId, teacherId);
      if (err) setError(err.message);
      else setMessages((data as ChatMessage[]) ?? []);
    },
    [teacherId]
  );

  useEffect(() => {
    (async () => {
      const { conversation: conv, error: convErr } = await getOrCreateConversation(teacherId);
      if (convErr || !conv) {
        setError(convErr?.message ?? 'Could not load conversation');
        setLoading(false);
        return;
      }
      setConversation(conv);
      await loadMessages(conv.id);
      setLoading(false);
    })();
  }, [teacherId, loadMessages]);

  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`chat:${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          const row = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [...prev, row];
          });
          setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  async function handleSend() {
    if (!text.trim() || !conversation) return;
    setSending(true);
    setError('');
    const { error: sendErr } = await sendChatMessage(
      conversation.id,
      teacherId,
      text.trim(),
      teacherId
    );
    setSending(false);
    if (sendErr) setError(sendErr);
    else setText('');
  }

  if (loading) return <LoadingScreen label="Loading chat…" />;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-slate-50"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 py-3"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text className="py-8 text-center text-slate-500">
            Message your administrator here.
          </Text>
        }
        renderItem={({ item }) => {
          const mine = item.sender_id === teacherId;
          return (
            <View className={`mb-2 max-w-[85%] ${mine ? 'self-end' : 'self-start'}`}>
              <View
                className={`rounded-2xl px-4 py-2 ${mine ? 'bg-brand-600' : 'bg-white border border-slate-200'}`}
              >
                <Text className={mine ? 'text-white' : 'text-slate-800'}>{item.body}</Text>
              </View>
              <Text className="mt-0.5 text-[10px] text-slate-400">
                {new Date(item.created_at).toLocaleTimeString()}
              </Text>
            </View>
          );
        }}
      />
      <View className="flex-row items-end gap-2 border-t border-slate-200 bg-white px-3 py-2">
        <TextInput
          className="max-h-28 flex-1 rounded-xl border border-slate-200 px-3 py-2"
          placeholder="Type a message…"
          value={text}
          onChangeText={setText}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={sending || !text.trim()}
          className="rounded-xl bg-brand-600 px-4 py-2.5 disabled:opacity-50"
        >
          <Text className="font-semibold text-white">{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
