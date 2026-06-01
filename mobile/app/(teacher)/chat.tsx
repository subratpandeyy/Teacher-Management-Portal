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
          <Text className="py-8 text-center text-slate-500">Message your administrator here.</Text>
        }
        renderItem={({ item }) => {
          const mine = item.sender_id === teacherId;
          const deleted = !!item.deleted_at;
          const hasAttachment = !!item.attachment_url && !deleted;
          return (
            <Pressable
              className={`mb-2 max-w-[85%] ${mine ? 'self-end' : 'self-start'}`}
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
                className={`rounded-2xl px-4 py-2 ${mine ? 'bg-brand-600' : 'bg-white border border-slate-200'} ${deleted ? 'opacity-60' : ''}`}
              >
                {!deleted && item.body && !item.body.startsWith('📎') ? (
                  <Text className={mine ? 'text-white' : 'text-slate-800'}>{item.body}</Text>
                ) : null}
                {deleted ? (
                  <Text className={`italic ${mine ? 'text-white' : 'text-slate-500'}`}>Message deleted</Text>
                ) : null}
                {hasAttachment ? (
                  <Pressable onPress={() => openAttachment(item.attachment_url!)} className="mt-1">
                    <Text className={mine ? 'text-white underline' : 'text-brand-600'}>
                      📎 {item.attachment_name ?? 'Attachment'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text className="mt-0.5 text-[10px] text-slate-400">
                {new Date(item.created_at).toLocaleTimeString()}
                {item.updated_at !== item.created_at ? ' · edited' : ''}
              </Text>
            </Pressable>
          );
        }}
      />
      <View className="border-t border-slate-200 bg-white px-3 py-2">
        {editingId ? (
          <Text className="mb-1 text-xs text-brand-600">Editing message — send to save</Text>
        ) : null}
        <View className="flex-row items-end gap-2">
          <Pressable
            onPress={handleAttach}
            disabled={attaching || !!editingId}
            className="rounded-xl border border-slate-200 px-3 py-2.5 disabled:opacity-50"
          >
            <Text className="text-lg">{attaching ? '…' : '📎'}</Text>
          </Pressable>
          <TextInput
            className="max-h-28 flex-1 rounded-xl border border-slate-200 px-3 py-2"
            placeholder="Type a message…"
            value={text}
            onChangeText={setText}
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !text.trim() || attaching}
            className="rounded-xl bg-brand-600 px-4 py-2.5 disabled:opacity-50"
          >
            <Text className="font-semibold text-white">{sending ? '…' : editingId ? 'Save' : 'Send'}</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
