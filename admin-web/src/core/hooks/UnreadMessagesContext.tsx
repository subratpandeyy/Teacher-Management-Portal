import { createContext, useContext, type ReactNode } from 'react';
import { useUnreadMessages } from './useUnreadMessages';
import { useAuth } from '../auth/AuthContext';
import type { ConversationSummary } from '../services/chatService';

interface UnreadMessagesValue {
  totalUnread: number;
  conversations: ConversationSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
}

const UnreadMessagesContext = createContext<UnreadMessagesValue | null>(null);

export function UnreadMessagesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const value = useUnreadMessages(user?.id);
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
