import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  fetchConversationMessages, 
  getTeacherConversation, 
  sendAdminChatMessage, 
  updateChatMessage,
  uploadChatAttachment
} from '../../lib/features';
import { ChatBadge } from './ChatBadge';
import { Loader2, Send, Paperclip, X } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthContext';
import type { UserRole } from '../../../../shared/types';

interface ChatRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  sender?: {
    display_name: string | null;
    role: UserRole;
  };
}

export function ChatTab({ teacherId }: { teacherId: string }) {
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async (convId: string) => {
    // Join with profiles to get display_name and role
    const { data, error: msgErr } = await supabase
      .from('chat_messages')
      .select(`
        id, 
        conversation_id, 
        sender_id, 
        body, 
        attachment_url, 
        attachment_name, 
        created_at,
        sender:profiles!chat_messages_sender_id_fkey(display_name, role)
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (msgErr) setError(msgErr.message);
    else setMessages((data as any[]) ?? []);
  }, []);

  useEffect(() => {
    let channel: any = null;

    (async () => {
      const { data: conv, error: convErr } = await getTeacherConversation(teacherId);
      if (convErr || !conv) {
        setError(convErr?.message ?? 'No conversation');
        setLoading(false);
        return;
      }
      setConversationId(conv.id);
      await loadMessages(conv.id);
      setLoading(false);

      channel = supabase
        .channel(`admin-chat:${conv.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conv.id}` },
          () => loadMessages(conv.id)
        )
        .subscribe();
    })();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [teacherId, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim() || !user) return;

    const body = text.trim();
    setText('');

    const { error: err } = await sendAdminChatMessage(conversationId, user.id, teacherId, body);
    if (err) {
      setError(String(err));
      setText(body); // Restore text on error
    } else {
      await loadMessages(conversationId);
    }
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversationId || !user) return;

    setUploading(true);
    setError('');
    try {
      const up = await uploadChatAttachment(conversationId, file);
      if (up.error) throw new Error(up.error);

      const { error: msgErr } = await sendAdminChatMessage(conversationId, user.id, teacherId, `Shared a file: ${file.name}`, {
        url: up.path || '',
        name: file.name,
      });

      if (msgErr) throw new Error(String(msgErr));
      await loadMessages(conversationId);
      e.target.value = '';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500" /></div>;

  return (
    <div className="flex flex-col h-[500px] border border-slate-100 rounded-xl bg-slate-50 overflow-hidden">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1">
                {!isMe && <span className="text-xs font-bold text-slate-700">{msg.sender?.display_name}</span>}
                {msg.sender?.role && <ChatBadge role={msg.sender.role} />}
                <span className="text-[10px] text-slate-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 shadow-sm ${
                isMe ? 'bg-blue-600 text-white' : 'bg-white text-slate-900 border border-slate-100'
              }`}>
                <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                {msg.attachment_url && (
                  <div className={`mt-2 p-2 rounded-lg text-xs flex items-center gap-2 ${isMe ? 'bg-blue-700' : 'bg-slate-50'}`}>
                    <Paperclip className="h-3 w-3" />
                    <span className="truncate max-w-[150px]">{msg.attachment_name}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input area */}
      <div className="p-4 bg-white border-t border-slate-100">
        {error && (
          <div className="mb-2 p-2 bg-rose-50 text-rose-600 text-xs rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError('')}><X className="h-3 w-3" /></button>
          </div>
        )}
        <form onSubmit={send} className="flex items-center gap-2">
          <label className="cursor-pointer p-2 text-slate-400 hover:text-slate-600 transition">
            <Paperclip className="h-5 w-5" />
            <input type="file" className="hidden" onChange={onFileChange} disabled={uploading} />
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-slate-50 border-none rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!text.trim() || uploading}
            className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
