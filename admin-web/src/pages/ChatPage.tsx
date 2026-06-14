import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { ChatTab } from '../features/chat/ChatTab';
import { Loader2, MessageSquare } from 'lucide-react';
import type { Profile } from '../../../shared/types';

export function ChatPage() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, display_name, role, created_at')
          .in('role', ['teacher', 'coordinator', 'student'])
          .order('display_name');

        if (error) throw error;
        setUsers((data as Profile[]) ?? []);
        if (data?.length) setSelectedId(data[0].id);
      } catch (err) {
        console.error('Error loading chat users:', err);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Messages</h2>
        <p className="text-slate-500">Direct chat with teachers, coordinators, and students.</p>
      </div>

      <div className="flex h-[calc(100vh-220px)] min-h-[480px] overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-slate-100">
          {users.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No users available for chat.</p>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => setSelectedId(user.id)}
                className={`flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                  selectedId === user.id ? 'bg-green-50' : ''
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                  <MessageSquare className="h-4 w-4 text-slate-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-900">{user.display_name ?? 'User'}</p>
                  <p className="text-xs capitalize text-slate-400">{user.role}</p>
                </div>
              </button>
            ))
          )}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {selectedId ? (
            <ChatTab key={selectedId} teacherId={selectedId} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              Select a user to start chatting
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
