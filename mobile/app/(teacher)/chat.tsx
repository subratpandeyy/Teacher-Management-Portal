import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import {
  fetchChatMessages,
  getChatAttachmentUrl,
  getOrCreateConversation,
  sendChatMessage,
  softDeleteChatMessage,
  updateChatMessage,
  uploadChatAttachment,
} from '../../lib/api';
import type { ChatMessage } from '../../lib/api';
import type { Conversation } from '../../lib/supabase';
import { supabase } from '../../lib/supabase';
import { pickDocumentForUpload } from '../../lib/documentPicker';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';
import { EmptyState } from '../../components/ui/EmptyState';

export default function ChatScreen() {
  const { user } = useAuth();
  const teacherId = user!.id;
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const listRef = useRef<FlatList>(null);
  const reloadSeq = useRef(0);

  const loadMessages = useCallback(
    async (conversationId: string) => {
      const seq = ++reloadSeq.current;
      const { data, error: err } = await fetchChatMessages(conversationId, teacherId);
      if (seq !== reloadSeq.current) return;
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
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => {
          void loadMessages(conversation.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, loadMessages]);

  async function handleSend() {
    if (!conversation) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    setError('');

    if (editingId) {
      const { error: err } = await updateChatMessage(editingId, teacherId, trimmed);
      setSending(false);
      if (err) setError(err.message);
      else {
        setEditingId(null);
        setText('');
        await loadMessages(conversation.id);
      }
      return;
    }

    const { error: sendErr } = await sendChatMessage(
      conversation.id,
      teacherId,
      trimmed,
      teacherId
    );
    setSending(false);
    if (sendErr) setError(sendErr);
    else setText('');
  }

  async function handleAttach() {
    if (!conversation || attaching) return;
    const picked = await pickDocumentForUpload();
    if (!picked.ok) {
      if ('error' in picked && picked.error) setError(picked.error);
      return;
    }

    setAttaching(true);
    setError('');

    const uploaded = await uploadChatAttachment(conversation.id, teacherId, picked.asset);

    if (uploaded.error || !uploaded.path) {
      setAttaching(false);
      setError(uploaded.error ?? 'Upload failed');
      return;
    }

    const body = text.trim() || `📎 ${uploaded.name ?? picked.asset.name}`;
    const { error: sendErr } = await sendChatMessage(
      conversation.id,
      teacherId,
      body,
      teacherId,
      {
        url: uploaded.path,
        name: uploaded.name ?? picked.asset.name,
        type: uploaded.mimeType ?? picked.asset.mimeType,
      }
    );

    setAttaching(false);
    if (sendErr) setError(sendErr);
    else setText('');
  }

  function confirmDelete(messageId: string) {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!conversation) return;
          await softDeleteChatMessage(messageId, teacherId);
          await loadMessages(conversation.id);
        },
      },
    ]);
  }

  async function openAttachment(path: string) {
    const { url, error: err } = await getChatAttachmentUrl(path);
    if (url) await Linking.openURL(url);
    else setError(err?.message ?? 'Could not open file');
  }

  if (loading) return <LoadingScreen label="Loading chat…" />;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View className="border-b border-slate-100 bg-white px-4 py-2.5">
        <View className="flex-row items-center gap-2">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-accent-blue-100">
            <Feather name="message-circle" size={18} color="#3B82F6" />
          </View>
          <View>
            <Text className="font-semibold text-slate-900">Administrator</Text>
            <Text className="text-xs text-slate-500">Private support channel</Text>
          </View>
        </View>
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerClassName="px-4 py-3 flex-grow"
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <EmptyState
            icon="message-circle"
            title="Start a conversation"
            description="Message your administrator here."
          />
        }
        renderItem={({ item }) => {
          const mine = item.sender_id === teacherId;
          const deleted = !!item.deleted_at;
          const hasAttachment = !!item.attachment_url && !deleted;
          const bodyOnly = item.body && !item.body.startsWith('📎');
          return (
            <Pressable
              className={`mb-3 max-w-[88%] ${mine ? 'self-end' : 'self-start'}`}
              onLongPress={
                mine && !deleted
                  ? () => {
                      Alert.alert('Message', undefined, [
                        {
                          text: 'Edit',
                          onPress: () => {
                            setEditingId(item.id);
                            setText(item.body.startsWith('📎') ? '' : item.body);
                          },
                        },
                        { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(item.id) },
                        { text: 'Cancel', style: 'cancel' },
                      ]);
                    }
                  : undefined
              }
            >
              <View
                className={`rounded-2xl px-4 py-2.5 ${
                  mine
                    ? 'rounded-br-md bg-accent-blue-500'
                    : 'rounded-bl-md border border-slate-100 bg-white'
                } ${deleted ? 'opacity-60' : ''}`}
                style={
                  mine
                    ? { shadowColor: '#22C55E', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }
                    : undefined
                }
              >
                {!deleted && bodyOnly ? (
                  <Text className={mine ? 'text-white' : 'text-slate-800'}>{item.body}</Text>
                ) : null}
                {deleted ? (
                  <Text className={`italic ${mine ? 'text-green-100' : 'text-slate-500'}`}>
                    Message deleted
                  </Text>
                ) : null}
                {hasAttachment ? (
                  <Pressable
                    onPress={() => openAttachment(item.attachment_url!)}
                    className={`mt-1 flex-row items-center gap-2 rounded-lg px-2 py-1.5 ${mine ? 'bg-white/20' : 'bg-accent-blue-50'}`}
                  >
                    <Feather name="paperclip" size={14} color={mine ? '#fff' : '#3B82F6'} />
                    <Text
                      className={`flex-1 text-sm font-medium ${mine ? 'text-white' : 'text-accent-blue-600'}`}
                      numberOfLines={1}
                    >
                      {item.attachment_name ?? 'Attachment'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text className={`mt-1 text-[10px] ${mine ? 'text-right text-slate-400' : 'text-slate-400'}`}>
                {new Date(item.created_at).toLocaleTimeString()}
                {item.updated_at !== item.created_at ? ' · edited' : ''}
              </Text>
            </Pressable>
          );
        }}
      />
      <View className="border-t border-slate-100 bg-white px-3 py-2.5">
        {editingId ? (
          <View className="mb-2 flex-row items-center gap-1 rounded-lg bg-accent-blue-50 px-2 py-1">
            <Feather name="edit-2" size={12} color="#3B82F6" />
            <Text className="text-xs font-medium text-accent-blue-600">Editing message</Text>
          </View>
        ) : null}
        <View className="flex-row items-end gap-2">
          <Pressable
            onPress={handleAttach}
            disabled={attaching || !!editingId}
            className="h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 disabled:opacity-50"
          >
            {attaching ? (
              <Text className="text-slate-400">…</Text>
            ) : (
              <Feather name="paperclip" size={20} color="#3B82F6" />
            )}
          </Pressable>
          <TextInput
            className="max-h-28 min-h-[44px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-base text-slate-900"
            placeholder="Type a message…"
            placeholderTextColor="#94A3B8"
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !text.trim() || attaching}
            className="h-11 w-11 items-center justify-center rounded-xl bg-accent-blue-500 disabled:opacity-50"
          >
            <Feather name={editingId ? 'check' : 'send'} size={18} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
