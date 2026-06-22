import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChatTab } from '../features/chat/ChatTab';
import { Loader2, MessageSquare, Search, ArrowLeft, ChevronLeft } from 'lucide-react';
import type { Profile } from '../../../shared/types';
import { useAuth } from '../core/auth/AuthContext';
import { useUnreadMessagesContext } from '../core/hooks/UnreadMessagesContext';

const roleClass = (role: string) =>
  role === 'admin' ? 'role-admin' :
  role === 'coordinator' ? 'role-coordinator' :
  role === 'teacher' ? 'role-teacher' :
  'role-student';

export function ChatPage() {
  const { user } = useAuth();
  const { conversations, refresh } = useUnreadMessagesContext();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, role, created_at')
          .is('deleted_at', null)
          .neq('id', user?.id ?? '')
          .in('role', ['admin', 'teacher', 'coordinator', 'student'])
          .order('display_name');

        if (error) throw error;
        setUsers((data as Profile[]) ?? []);
      } catch (err) {
        console.error('Error loading chat users:', err);
      } finally {
        setLoading(false);
      }
    }

    if (user?.id) void load();
    else setLoading(false);
  }, [user?.id]);

  const unreadByUser = useMemo(() => {
    const map = new Map<string, { count: number; preview: string | null }>();
    for (const conv of conversations) {
      if (conv.type !== 'direct') continue;
      const match = users.find((u) => conv.name?.includes(u.display_name ?? ''));
      if (match) {
        map.set(match.id, {
          count: Number(conv.unread_count ?? 0),
          preview: conv.latest_message_body,
        });
      }
    }
    return map;
  }, [conversations, users]);

  const filteredUsers = users.filter((u) =>
    u.display_name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRead = useCallback(() => { void refresh(); }, [refresh]);

  const handleSelectContact = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedId(null);
  }, []);

  const sortedUsers = [...filteredUsers].sort((a, b) => {
    const unreadA = unreadByUser.get(a.id)?.count ?? 0;
    const unreadB = unreadByUser.get(b.id)?.count ?? 0;
    if (unreadA !== unreadB) return unreadB - unreadA;
    return (a.display_name ?? '').localeCompare(b.display_name ?? '');
  });

  if (loading) {
    return (
      <div className="loading-page min-h-[400px]">
        <div className="spinner" aria-label="Loading conversations" />
      </div>
    );
  }

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <h1 className="page-title">Messages</h1>
        <p className="page-subtitle">Direct chat with teachers, coordinators, students, and admins.</p>
      </div>

      <div className="flex h-[calc(100vh-10rem)] min-h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:h-[calc(100vh-16rem)] md:min-h-[480px]" aria-label="Chat interface">
        {/* Contact sidebar: hidden on mobile when a conversation is open */}
        <aside
          className={`flex w-full flex-col border-r border-slate-100 md:w-80 md:shrink-0 ${
            selectedId ? 'hidden md:flex' : 'flex'
          }`}
          aria-label="Conversation list"
        >
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
                aria-label="Search contacts"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto" role="list" aria-label="Contact list">
            {sortedUsers.length === 0 ? (
              <div className="empty-state py-12">
                <MessageSquare className="empty-state-icon" />
                <p className="empty-state-title">No contacts found</p>
                <p className="empty-state-desc">
                  {search ? 'Try a different search term.' : 'No users available for chat.'}
                </p>
              </div>
            ) : (
              sortedUsers.map((chatUser) => {
                const unread = unreadByUser.get(chatUser.id);
                return (
                  <button
                    key={chatUser.id}
                    type="button"
                    onClick={() => handleSelectContact(chatUser.id)}
                    className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3.5 text-left transition-colors hover:bg-slate-50 ${
                      selectedId === chatUser.id ? 'bg-green-50/70 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                    }`}
                    role="listitem"
                    aria-current={selectedId === chatUser.id ? 'true' : undefined}
                    aria-label={`Chat with ${chatUser.display_name ?? 'User'}${unread?.count ? `, ${unread.count} unread messages` : ''}`}
                  >
                    <div className="relative shrink-0">
                      <div className="avatar-md" aria-hidden="true">
                        {chatUser.display_name?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      {(unread?.count ?? 0) > 0 ? (
                        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white" aria-hidden="true">
                          {unread!.count > 9 ? '9+' : unread!.count}
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`truncate ${(unread?.count ?? 0) > 0 ? 'font-bold text-slate-900' : 'font-medium text-slate-900'}`}>
                          {chatUser.display_name ?? 'User'}
                        </p>
                        <span className={roleClass(chatUser.role)}>{chatUser.role}</span>
                      </div>
                      {unread?.preview ? (
                        <p className={`truncate text-xs mt-0.5 ${(unread?.count ?? 0) > 0 ? 'font-medium text-slate-700' : 'text-slate-500'}`}>
                          {unread.preview}
                        </p>
                      ) : (
                        <p className="truncate text-xs text-slate-400 mt-0.5">No messages yet</p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Chat panel: full screen on mobile when a conversation is open */}
        <main
          className={`flex min-w-0 flex-1 flex-col ${
            !selectedId ? 'hidden md:flex' : 'flex'
          }`}
          aria-label="Chat area"
        >
          {selectedId ? (
            <>
              {/* Mobile back button */}
              <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 md:hidden">
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="btn-ghost rounded-lg p-1.5 -ml-1.5"
                  aria-label="Back to contacts"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="avatar-sm shrink-0" aria-hidden="true">
                    {users.find(u => u.id === selectedId)?.display_name?.charAt(0).toUpperCase() ?? '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {users.find(u => u.id === selectedId)?.display_name ?? 'User'}
                    </p>
                  </div>
                </div>
              </div>
              <ChatTab
                key={selectedId}
                otherUserId={selectedId}
                onRead={handleRead}
              />
            </>
          ) : (
            <div className="hidden md:flex flex-1 items-center justify-center">
              <div className="empty-state">
                <MessageSquare className="empty-state-icon h-16 w-16 text-slate-200" />
                <p className="empty-state-title text-lg">Select a Conversation</p>
                <p className="empty-state-desc">Choose a contact from the sidebar to start chatting.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
