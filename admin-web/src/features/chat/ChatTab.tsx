import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import {
  getDirectConversation,
  sendDirectChatMessage,
  uploadChatAttachment,
  updateChatMessage,
  softDeleteChatMessage,
} from '../../lib/features';
import { markConversationRead } from '../../core/services/chatService';
import { ChatBadge } from './ChatBadge';
import { Loader2, Send, Paperclip, X, FileText, Edit2, Trash2, Check } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthContext';
import type { UserRole } from '../../../../shared/types';

interface ChatRow {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
  edited_at?: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
  sender?: {
    display_name: string | null;
    role: UserRole;
  };
}

export function ChatTab({
  otherUserId,
  teacherId,
  onRead,
}: {
  otherUserId?: string;
  teacherId?: string;
  onRead?: () => void;
}) {
  const targetUserId = otherUserId ?? teacherId;
  const { user } = useAuth();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMessagesRef = useRef<((convId: string) => Promise<void>) | null>(null);

  const subId = useRef(0);

  const loadMessages = useCallback(async (convId: string) => {
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
        updated_at,
        deleted_at,
        edited_at,
        sender:profiles!chat_messages_sender_id_fkey(display_name, role)
      `)
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (msgErr) setError(msgErr.message);
    else setMessages((data as unknown as ChatRow[]) ?? []);
  }, []);

  useEffect(() => {
    loadMessagesRef.current = loadMessages;
  }, [loadMessages]);

  useEffect(() => {
    if (!targetUserId) {
      setLoading(false);
      return;
    }

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let isMounted = true;
    let currentConvId: string | null = null;

    (async () => {
      const { data: conv, error: convErr } = await getDirectConversation(targetUserId);
      if (!isMounted) return;

      if (convErr || !conv) {
        setError(convErr?.message ?? 'No conversation');
        setLoading(false);
        return;
      }
      currentConvId = conv.id;
      setConversationId(conv.id);
      await loadMessages(conv.id);
      if (user?.id) {
        await markConversationRead(conv.id, user.id);
        onRead?.();
      }
      setLoading(false);

      const id = ++subId.current;
      const channelName = `admin-chat:${conv.id}:${id}`;

      channel = supabase
        .channel(channelName, {
          config: {
            broadcast: { self: false },
            presence: { key: '' },
          },
        })
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conv.id}` },
          () => {
            if (loadMessagesRef.current && currentConvId) loadMessagesRef.current(currentConvId);
          }
        );

      channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Chat channel subscribed: ${channelName}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Chat channel error (${channelName}):`, err);
        } else if (status === 'TIMED_OUT') {
          console.warn(`Chat channel timed out (${channelName}), reconnecting...`);
        }
      });
    })();

    return () => {
      isMounted = false;
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [targetUserId, user?.id, onRead]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!conversationId || !text.trim() || !user) return;

    const body = text.trim();

    if (editingId) {
      setText('');
      const { error: err } = await updateChatMessage(editingId, body);
      if (err) {
        setError(String(err));
        setText(body);
      } else {
        setEditingId(null);
        await loadMessages(conversationId);
      }
      return;
    }

    setText('');

    const { error: err } = await sendDirectChatMessage(conversationId, body);
    if (err) {
      setError(String(err));
      setText(body);
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

      const { error: msgErr } = await sendDirectChatMessage(
        conversationId,
        `Shared a file: ${file.name}`,
        { url: up.path || '', name: file.name }
      );

      if (msgErr) throw new Error(String(msgErr));
      await loadMessages(conversationId);
      e.target.value = '';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-page">
        <Loader2 className="spinner" aria-label="Loading conversation" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas" role="log" aria-label="Chat messages">
      <div
        ref={scrollRef}
        className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          const deleted = !!msg.deleted_at;
          const messageTime = new Date(msg.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          });
          const isEdited = msg.edited_at && msg.edited_at !== msg.created_at;
          const isAdmin = user?.role === 'admin';

          return (
            <div
              key={msg.id}
              className={`group flex flex-col max-w-full ${isMe ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`flex items-center gap-2 mb-1.5 max-w-full ${isMe ? 'flex-row-reverse' : ''}`}
              >
                {!isMe && (
                  <span className="text-xs font-semibold text-slate-700 truncate min-w-0">
                    {msg.sender?.display_name}
                  </span>
                )}
                {!isMe && msg.sender?.role && <ChatBadge role={msg.sender.role} />}
                <span className="text-[11px] text-slate-400 shrink-0">{messageTime}</span>
              </div>

              <div className={`${isMe ? 'chat-message-me' : 'chat-message-other'} max-w-[85%] md:max-w-[70%] ${deleted ? 'opacity-60' : ''}`}>
                {deleted ? (
                  <p className="text-sm italic text-slate-500">Message deleted</p>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm break-words">{msg.body}</p>
                    {isEdited && (
                      <p className="text-[10px] mt-1 opacity-70">· edited</p>
                    )}
                  </>
                )}
                {!deleted && msg.attachment_url && (
                  <div
                    className={`mt-2.5 flex items-center gap-2 rounded-lg p-2 ${
                      isMe ? 'bg-green-700/50' : 'bg-slate-50'
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <a
                      href={msg.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="max-w-[140px] md:max-w-[180px] truncate text-xs underline underline-offset-2 hover:opacity-80"
                      download={msg.attachment_name ?? undefined}
                    >
                      {msg.attachment_name ?? 'Attachment'}
                    </a>
                  </div>
                )}

                {/* Edit/Delete buttons - visible on hover */}
                {!deleted && (isMe || isAdmin) && (
                  <div className={`flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'justify-end' : 'justify-start'}`}>
                    {isMe && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(msg.id);
                          setText(msg.body);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded bg-white/20 text-slate-600 hover:bg-white/40"
                        aria-label="Edit message"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm('Delete this message?')) return;
                        await softDeleteChatMessage(msg.id);
                        await loadMessages(conversationId!);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/20 text-rose-600 hover:bg-white/40"
                      aria-label="Delete message"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">No messages yet. Start a conversation!</p>
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white px-3 py-3 sm:px-6 sm:py-4">
        {error && (
          <div
            className="mb-2 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600"
            role="alert"
          >
            <span className="min-w-0 flex-1 truncate">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="shrink-0 rounded p-0.5 hover:bg-rose-100 ml-2"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {editingId && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-600">
            <Edit2 className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 min-w-0 truncate">Editing message</span>
            <button
              type="button"
              onClick={() => { setEditingId(null); setText(''); }}
              className="shrink-0 rounded p-0.5 hover:bg-blue-100"
              aria-label="Cancel editing"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <form onSubmit={send} className="flex items-end gap-2 sm:gap-3">
          <div className="flex-1 min-w-0">
            <label className="sr-only" htmlFor="chat-message-input">Message</label>
            <input
              id="chat-message-input"
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={editingId ? 'Edit message…' : 'Type your message…'}
              className="input"
              aria-label="Type a message"
            />
          </div>
          <label className="btn-ghost cursor-pointer rounded-lg p-2 sm:p-2.5 text-slate-400 hover:text-slate-600 shrink-0">
            <Paperclip className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">Attach file</span>
            <input
              type="file"
              className="hidden"
              onChange={onFileChange}
              disabled={uploading || !!editingId}
              aria-label="Upload attachment"
            />
          </label>
          <button
            type="submit"
            disabled={!text.trim() || uploading}
            className="btn-primary rounded-lg p-2 sm:p-2.5 shrink-0"
            aria-label={editingId ? 'Save edit' : 'Send message'}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            ) : editingId ? (
              <Check className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Send className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </form>
        {uploading && (
          <p className="mt-1.5 text-xs text-slate-400">Uploading file…</p>
        )}
      </div>
    </div>
  );
}
