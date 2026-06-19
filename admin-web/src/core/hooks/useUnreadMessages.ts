import { useCallback, useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  fetchConversationsWithUnread,
  type ConversationSummary,
} from '../services/chatService';

export function useUnreadMessages(userId: string | undefined) {
  const [totalUnread, setTotalUnread] = useState(0);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const convIdsRef = useRef<string[]>([]);
  const messagesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const participantsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const subId = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) {
      setTotalUnread(0);
      setConversations([]);
      setLoading(false);
      return;
    }

    const { data } = await fetchConversationsWithUnread(userId);
    setConversations(data);
    setTotalUnread(data.reduce((sum, c) => sum + Number(c.unread_count ?? 0), 0));
    setLoading(false);
  }, [userId]);

  // Keep a stable reference to refresh for the channel handlers
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
    // Tear down previous messages channel
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
          // Refresh conversations and resubscribe messages with updated IDs
          if (refreshRef.current) await refreshRef.current();
          const newIds = convIdsRef.current;
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

  return { totalUnread, conversations, loading, refresh };
}
