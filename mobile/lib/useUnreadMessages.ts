import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from './supabase';
import {
  fetchConversationsWithUnread,
  type ConversationSummary,
} from './chatService';

export function useUnreadMessages(userId: string | undefined) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const refreshRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const convIdsRef = useRef<string[]>([]);
  const messagesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const participantsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subId = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setTotalUnread(0);
      setConversations([]);
      return;
    }

    const { data } = await fetchConversationsWithUnread(userId);
    setConversations(data);
    setTotalUnread(data.reduce((sum, c) => sum + Number(c.unread_count ?? 0), 0));
  }, [userId]);

  // Keep stable reference
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Build a conversation_id=in.(...) filter string from conversation IDs
  const buildMessagesFilter = useCallback((convIds: string[]): string | null => {
    if (convIds.length === 0) return null;
    return `conversation_id=in.(${convIds.join(',')})`;
  }, []);

  // Subscribe to chat_messages changes scoped to the user's conversation IDs
  const subscribeToMessages = useCallback((convIds: string[]) => {
    if (messagesChannelRef.current) {
      void supabase.removeChannel(messagesChannelRef.current);
      messagesChannelRef.current = null;
    }

    const filter = buildMessagesFilter(convIds);
    if (!filter) return;

    const id = ++subId.current;
    const channelName = `unread-msgs:${userId}:${id}`;

    const channel = supabase
      .channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages', filter },
        () => {
          if (refreshRef.current) void refreshRef.current();
        }
      );

    channel.subscribe((status) => {
      console.log(`Messages channel ${channelName} status:`, status);
    });

    messagesChannelRef.current = channel;
  }, [buildMessagesFilter, userId]);

  useEffect(() => {
    if (!userId) return;

    // Load conversation IDs and subscribe to messages
    const initMessages = async () => {
      const { data } = await fetchConversationsWithUnread(userId);
      const convIds = (data ?? []).map(c => c.conversation_id);
      convIdsRef.current = convIds;
      subscribeToMessages(convIds);
    };
    void initMessages();

    // Subscribe to conversation_participants changes for this user
    const id = ++subId.current;
    const partChannelName = `unread-parts:${userId}:${id}`;

    const partChannel = supabase
      .channel(partChannelName, {
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
          table: 'conversation_participants',
          filter: `profile_id=eq.${userId}`,
        },
        async () => {
          if (refreshRef.current) await refreshRef.current();
          const { data } = await fetchConversationsWithUnread(userId);
          const updatedConvIds = (data ?? []).map(c => c.conversation_id);
          convIdsRef.current = updatedConvIds;
          subscribeToMessages(updatedConvIds);
        }
      );

    partChannel.subscribe((status) => {
      console.log(`Participants channel ${partChannelName} status:`, status);
    });

    participantsChannelRef.current = partChannel;

    return () => {
      if (messagesChannelRef.current) {
        void supabase.removeChannel(messagesChannelRef.current);
        messagesChannelRef.current = null;
      }
      if (participantsChannelRef.current) {
        void supabase.removeChannel(participantsChannelRef.current);
        participantsChannelRef.current = null;
      }
    };
  }, [userId, subscribeToMessages]);

  const unreadByConversation = conversations.reduce<Record<string, number>>((acc, c) => {
    acc[c.conversation_id] = Number(c.unread_count ?? 0);
    return acc;
  }, {});

  return { totalUnread, conversations, unreadByConversation, refresh };
}
