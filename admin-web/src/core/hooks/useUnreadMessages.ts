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

  const unreadSubId = useRef(0);

  useEffect(() => {
    if (!userId) return;

    const id = ++unreadSubId.current;
    const channelName = `unread:${userId}:${id}`;
    console.log('Creating channel:', channelName);
    
    const channel = supabase
      .channel(channelName, {
        // Disable shared channels to prevent conflicts
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        () => {
          if (refreshRef.current) void refreshRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_participants',
          filter: `profile_id=eq.${userId}`,
        },
        () => {
          if (refreshRef.current) void refreshRef.current();
        }
      );
    
    console.log('Subscribing channel:', channelName);
    channel.subscribe((status) => {
      console.log(`Channel ${channelName} status:`, status);
    });

    return () => {
      console.log('Removing channel:', channelName);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return { totalUnread, conversations, loading, refresh };
}
