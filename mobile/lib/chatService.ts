import { supabase } from '../lib/supabase';

export type ConversationSummary = {
  conversation_id: string;
  name: string;
  type: string;
  group_id: string | null;
  latest_message_body: string | null;
  latest_message_created_at: string | null;
  latest_message_sender_name: string | null;
  unread_count: number;
};

export async function fetchConversationsWithUnread(userId: string) {
  const { data, error } = await supabase.rpc('get_user_conversations_with_unread', {
    p_user_id: userId,
  });
  return { data: (data as ConversationSummary[]) ?? [], error };
}

export async function markConversationRead(conversationId: string, userId: string) {
  const { error } = await supabase.rpc('mark_conversation_as_read', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });
  return { error };
}

export async function getTotalUnreadCount(userId: string) {
  const { data, error } = await fetchConversationsWithUnread(userId);
  if (error) return { count: 0, error };
  const count = data.reduce((sum, c) => sum + Number(c.unread_count ?? 0), 0);
  return { count, error: null };
}
