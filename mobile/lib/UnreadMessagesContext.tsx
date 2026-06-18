import { createContext, useContext, type ReactNode } from 'react';
import { useUnreadMessages } from './useUnreadMessages';
import { useAuth } from './auth';
import type { ConversationSummary } from './chatService';

interface UnreadMessagesValue {
  totalUnread: number;
  conversations: ConversationSummary[];
  unreadByConversation: Record<string, number>;
  refresh: () => Promise<void>;
}

export const UnreadMessagesContext = createContext<UnreadMessagesValue | null>(null);

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const value = useUnreadMessages(profile?.id);
  return (
    <UnreadMessagesContext.Provider value={value}>
      {children}
    </UnreadMessagesContext.Provider>
  );
}

export function useUnreadMessagesContext(): UnreadMessagesValue {
  const ctx = useContext(UnreadMessagesContext);
  if (!ctx) {
    throw new Error(
      'useUnreadMessagesContext must be used within <UnreadMessagesProvider>'
    );
  }
  return ctx;
}
