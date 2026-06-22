import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { markConversationRead } from '../../lib/chatService';
import { useUnreadMessagesContext } from '../../lib/UnreadMessagesContext';
import { Card } from '../../components/ui/Card';

export default function StudentChat() {
  const { profile } = useAuth();
  const { refresh: refreshUnread } = useUnreadMessagesContext();
  const [channels, setChannels] = useState<any[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [selectedRecipient, setSelectedRecipient] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

  const fetchChatTargets = useCallback(async () => {
    if (!profile) return;
    try {
      const { data: assignments, error: assignErr } = await supabase
        .from('coordinator_assignments')
        .select('coordinator_id')
        .eq('student_id', profile.id);

      if (assignErr) throw assignErr;

      if (!assignments || assignments.length === 0) {
        setChannels([]);
        return;
      }

      const coordinatorIds = assignments.map(a => a.coordinator_id);

      const { data: profiles, error: profErr } = await supabase
        .from('profiles')
        .select('id, display_name, role')
        .is('deleted_at', null)
        .in('id', coordinatorIds)
        .order('display_name');

      if (profErr) throw profErr;
      setChannels(profiles || []);
    } catch (err) {
      console.error('Error fetching chat targets:', err);
    } finally {
      setLoadingChannels(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchChatTargets();
  }, [fetchChatTargets]);

  const loadMessages = useCallback(async (convId: string) => {
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select(`
          id,
          conversation_id,
          sender_id,
          body,
          created_at,
          updated_at,
          deleted_at,
          edited_at,
          sender:profiles!chat_messages_sender_id_fkey(display_name, role)
        `)
        .eq('conversation_id', convId)
        .order('created_at', { ascending: true });

      setMessages(data || []);
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  }, []);

  const loadMessagesRef = useRef<((convId: string) => Promise<void>) | undefined>(undefined);

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  const handleSelectRecipient = async (recipient: any) => {
    setSelectedRecipient(recipient);
    setLoadingMessages(true);
    try {
      const { data: convId, error } = await supabase.rpc('ensure_direct_conversation', {
        p_user_a: profile!.id,
        p_user_b: recipient.id,
      });

      if (error) throw error;
      setConversationId(convId);
      await markConversationRead(convId, profile!.id);
      await loadMessages(convId);
      void refreshUnread();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to start chat');
      setSelectedRecipient(null);
    } finally {
      setLoadingMessages(false);
    }
  };

  const subId = useRef(0);

  useEffect(() => {
    if (!conversationId) return;

    const id = ++subId.current;
    const channelName = `student-chat:${conversationId}:${id}`;
    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if (payload.eventType === 'DELETE') {
            setMessages(prev => prev.filter(m => m.id !== payload.old.id));
          } else if (payload.eventType === 'INSERT') {
            const { data } = await supabase
              .from('chat_messages')
              .select(`
                id, conversation_id, sender_id, body, created_at, updated_at, deleted_at, edited_at,
                sender:profiles!chat_messages_sender_id_fkey(display_name, role)
              `)
              .eq('id', payload.new.id)
              .single();
            if (data) {
              setMessages(prev => {
                if (prev.some(m => m.id === data.id)) return prev; // Dedupe
                return [...prev, data];
              });
            }
          } else if (payload.eventType === 'UPDATE') {
            setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, ...payload.new } : m));
          }
        },
      )
      .subscribe((status) => {
        console.log(`Channel ${channelName} status:`, status);
      });

    return () => {
      console.log('Removing channel:', channelName);
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const handleSend = async () => {
    if (!conversationId || !text.trim() || !profile) return;
    const trimmed = text.trim();
    setText('');
    setSending(true);

    try {
      if (editingId) {
        const { error } = await supabase
          .from('chat_messages')
          .update({ body: trimmed, edited_at: new Date().toISOString() })
          .eq('id', editingId)
          .eq('sender_id', profile.id);

        if (error) throw error;
        setEditingId(null);
      } else {
        const { error } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: conversationId,
            sender_id: profile.id,
            body: trimmed,
          });

        if (error) throw error;
      }
      await loadMessages(conversationId);
    } catch (err: any) {
      Alert.alert('Error sending message', err?.message);
      setText(trimmed);
    } finally {
      setSending(false);
    }
  };

  const handleLongPress = (msg: any) => {
    if (msg.sender_id !== profile!.id) return;
    Alert.alert('Message Options', undefined, [
      {
        text: 'Edit',
        onPress: () => {
          setEditingId(msg.id);
          setText(msg.body);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error } = await supabase
              .from('chat_messages')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', msg.id)
              .eq('sender_id', profile!.id);

            if (error) throw error;
            loadMessages(conversationId!);
          } catch (err: any) {
            Alert.alert('Error deleting message', err?.message);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  if (loadingChannels) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50">
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (channels.length === 0 && !loadingChannels) {
    return (
      <View className="flex-1 items-center justify-center bg-slate-50 p-8">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-2xl bg-blue-50">
          <Feather name="message-circle" size={28} color="#3B82F6" />
        </View>
        <Text className="text-center text-lg font-bold text-slate-900">No Coordinator Assigned</Text>
        <Text className="mt-2 text-center text-sm leading-5 text-slate-500">
          You don't have a coordinator assigned yet. Please contact your administrator.
        </Text>
      </View>
    );
  }

  if (selectedRecipient) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-slate-50"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
      >
        <View className="border-b border-slate-100 bg-white px-4 py-3 flex-row items-center justify-between">
          <Pressable
            onPress={() => {
              setSelectedRecipient(null);
              setConversationId(null);
              setMessages([]);
            }}
            className="flex-row items-center gap-2"
          >
            <Feather name="arrow-left" size={20} color="#475569" />
            <View className="h-10 w-10 items-center justify-center rounded-full bg-blue-100">
              <Text className="text-base font-bold text-blue-600">
                {selectedRecipient.display_name?.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View>
              <Text className="text-sm font-bold text-slate-900">{selectedRecipient.display_name}</Text>
              <Text className="text-xs text-slate-500 capitalize">{selectedRecipient.role}</Text>
            </View>
          </Pressable>
        </View>

        {loadingMessages ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, flexGrow: 1 }}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isMine = item.sender_id === profile!.id;
              const deleted = !!item.deleted_at;
              const isEdited = item.edited_at && item.edited_at !== item.created_at;
              return (
                <Pressable
                  onLongPress={() => !deleted && handleLongPress(item)}
                  className={`mb-3 max-w-[80%] p-3.5 rounded-2xl ${
                    isMine
                      ? 'self-end bg-blue-500 rounded-tr-none'
                      : 'self-start bg-white border border-slate-100 rounded-tl-none'
                  } ${deleted ? 'opacity-60' : ''}`}
                >
                  {!isMine && !deleted && (
                    <Text className="mb-1 text-xs font-bold text-slate-400">
                      [{item.sender?.role?.toUpperCase()}] {item.sender?.display_name}
                    </Text>
                  )}
                  {deleted ? (
                    <Text className={`text-sm italic ${isMine ? 'text-blue-100' : 'text-slate-500'}`}>
                      Message deleted
                    </Text>
                  ) : (
                    <Text className={`text-sm ${isMine ? 'font-medium text-white' : 'text-slate-800'}`}>
                      {item.body}
                    </Text>
                  )}
                  <Text className={`mt-1.5 text-right text-[10px] ${isMine ? 'text-blue-100' : 'text-slate-400'}`}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {isEdited ? ' · edited' : ''}
                  </Text>
                </Pressable>
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center py-20">
                <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
                  <Feather name="message-circle" size={28} color="#3B82F6" />
                </View>
                <Text className="text-sm font-medium text-slate-400">No messages. Say hello!</Text>
              </View>
            }
          />
        )}

        <View className="border-t border-slate-100 bg-white p-3 flex-row items-center gap-2">
          {editingId && (
            <Pressable onPress={() => { setEditingId(null); setText(''); }} className="p-1">
              <Feather name="x-circle" size={20} color="#EF4444" />
            </Pressable>
          )}
          <TextInput
            placeholder={editingId ? 'Edit message...' : 'Type a message...'}
            value={text}
            onChangeText={setText}
            placeholderTextColor="#94A3B8"
            className="flex-1 max-h-24 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800"
            multiline
          />
          <Pressable
            onPress={handleSend}
            disabled={sending || !text.trim()}
            className={`h-10 w-10 items-center justify-center rounded-xl ${
              !text.trim() ? 'bg-slate-100' : 'bg-blue-500 active:bg-blue-600'
            }`}
          >
            <Feather name={editingId ? 'check' : 'send'} size={18} color={!text.trim() ? '#94A3B8' : 'white'} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 p-4">
      <View className="mb-4">
        <Text className="text-2xl font-bold text-slate-900">My Coordinator</Text>
        <Text className="mt-0.5 text-sm text-slate-500">Chat with your assigned coordinator</Text>
      </View>

      <FlatList
        data={channels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleSelectRecipient(item)}
            className="mb-3 flex-row items-center justify-between rounded-2xl border border-slate-100 bg-white p-4 active:bg-slate-50"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.05,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View className="flex-row items-center gap-3">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <Text className="text-lg font-bold text-blue-600">
                  {item.display_name?.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View>
                <Text className="text-sm font-bold text-slate-900">{item.display_name}</Text>
                <Text className="text-xs capitalize text-slate-400">{item.role}</Text>
              </View>
            </View>
            <Feather name="message-square" size={18} color="#3B82F6" />
          </Pressable>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-20">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <Feather name="users" size={28} color="#3B82F6" />
            </View>
            <Text className="text-sm font-medium text-slate-400">No contacts found</Text>
          </View>
        }
      />
    </View>
  );
}
