import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  addGroupMember,
  createGroup,
  deleteGroup,
  fetchGroupMembers,
  fetchGroups,
  removeGroupMember,
  updateGroup,
  updateChatMessage,
  softDeleteChatMessage,
} from '../lib/features';
import type { Group } from '../lib/features';
import { useAuth } from '../core/auth/AuthContext';
import { useUnreadMessagesContext } from '../core/hooks/UnreadMessagesContext';
import { markConversationRead } from '../core/services/chatService';
import { MessageSquare, Users, Settings, Lock, Unlock, Send, Loader2, Plus, X, Edit2, Trash2, Check } from 'lucide-react';

export function GroupsPage() {
  const { profile, can, user } = useAuth();
  const { conversations, refresh: refreshUnread } = useUnreadMessagesContext();
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectableUsers, setSelectableUsers] = useState<{ id: string; display_name: string; role: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; teacher_id: string; display_name: string; role: string }[]>([]);
  
  // Group fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('public');
  const [membershipRules, setMembershipRules] = useState('');

  const [addUserId, setAddUserId] = useState('');
  const [msg, setMsg] = useState('');
  const [activePanelTab, setActivePanelTab] = useState<'members' | 'chat'>('members');

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatText, setChatText] = useState('');
  const [chatEditingId, setChatEditingId] = useState<string | null>(null);
  const [sendingChat, setSendingChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = groups.find((g) => g.id === selectedGroupId) ?? null;
  const unreadByGroupId = conversations.reduce<Record<string, number>>((acc, conv) => {
    if (conv.group_id) acc[conv.group_id] = Number(conv.unread_count ?? 0);
    return acc;
  }, {});

  async function loadGroups() {
    const { data } = await fetchGroups();
    setGroups((data as Group[]) ?? []);
  }

  async function loadMembers(groupId: string) {
    const { data } = await fetchGroupMembers(groupId);
    const mapped = ((data as any[]) ?? []).map((row) => {
      const p = row.profiles as { display_name: string | null; role: string } | null;
      return {
        id: String(row.id),
        teacher_id: String(row.teacher_id),
        display_name: p?.display_name ?? 'User',
        role: p?.role ?? 'student',
      };
    });
    setMembers(mapped);
  }

  async function loadSelectableUsers() {
    if (!profile) return;
    try {
      if (profile.role === 'teacher') {
        const { data: assigns } = await supabase
          .from('teacher_student_assignments')
          .select('student_id, student:profiles!teacher_student_assignments_student_id_fkey(id, display_name, role)')
          .is('student.deleted_at', null);

        const list = (assigns || [])
          .map((a: any) => a.student)
          .filter(Boolean)
          .map((s: any) => ({
            id: s.id,
            display_name: s.display_name ?? 'Student',
            role: s.role
          }));
        setSelectableUsers(list);
      } else {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, display_name, role')
          .is('deleted_at', null)
          .in('role', ['teacher', 'student', 'coordinator'])
          .order('display_name');

        setSelectableUsers((users || []) as any[]);
      }
    } catch (err) {
      console.error('Error loading selectable users:', err);
    }
  }

  async function loadGroupChat(groupId: string) {
    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('group_id', groupId)
      .maybeSingle();

    if (conv) {
      setConversationId(conv.id);
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('id, sender_id, body, created_at, edited_at, deleted_at, sender:profiles!chat_messages_sender_id_fkey(display_name, role)')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true });
      setChatMessages(msgs || []);
    } else {
      setConversationId(null);
      setChatMessages([]);
    }
  }

  useEffect(() => {
    void loadGroups();
    void loadSelectableUsers();
  }, [profile]);

  useEffect(() => {
    if (!selectedGroupId) {
      setMembers([]);
      setConversationId(null);
      setChatMessages([]);
      return;
    }

    void loadMembers(selectedGroupId);
    void loadGroupChat(selectedGroupId);
  }, [selectedGroupId]);

  const chatSubId = useRef(0);

  // Realtime subscription for group chat
  useEffect(() => {
    if (!conversationId) return;

    const id = ++chatSubId.current;
    const channelName = `group_chat:${conversationId}:${id}`;
    
    const channel = supabase
      .channel(channelName, {
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
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          supabase
            .from('chat_messages')
            .select('id, sender_id, body, created_at, edited_at, deleted_at, sender:profiles!chat_messages_sender_id_fkey(display_name, role)')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              setChatMessages(data || []);
            });
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
  }, [conversationId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, activePanelTab]);

  useEffect(() => {
    if (activePanelTab !== 'chat' || !conversationId || !user?.id) return;
    void markConversationRead(conversationId, user.id).then(() => refreshUnread());
  }, [activePanelTab, conversationId, user?.id, refreshUnread]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    const { error } = await createGroup(name, description || null, type, membershipRules);
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setMsg('Group created successfully.');
      setName('');
      setDescription('');
      setMembershipRules('');
      setType('public');
      await loadGroups();
    }
  }

  async function handleUpdate() {
    if (!selected) return;
    setMsg('');
    const { error } = await updateGroup(
      selected.id,
      selected.name,
      selected.description,
      selected.type,
      selected.membership_rules ?? ''
    );
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setMsg('Group updated successfully.');
      await loadGroups();
    }
  }

  async function handleDelete() {
    if (!selected || !confirm('Delete this group?')) return;
    setMsg('');
    const { error } = await deleteGroup(selected.id);
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setSelectedGroupId(null);
      await loadGroups();
      setMsg('Group deleted successfully.');
    }
  }

  async function handleAddMember() {
    if (!selectedGroupId || !addUserId) return;
    setMsg('');
    const { error } = await addGroupMember(selectedGroupId, addUserId);
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setMsg('Member added.');
      setAddUserId('');
      await loadMembers(selectedGroupId);
    }
  }

  async function handleRemoveMember(memberTeacherId: string) {
    if (!selectedGroupId) return;
    setMsg('');
    const { error } = await removeGroupMember(selectedGroupId, memberTeacherId);
    if (error) {
      setMsg(`Error: ${error.message}`);
    } else {
      setMsg('Member removed.');
      await loadMembers(selectedGroupId);
    }
  }

  async function handleSendChat() {
    if (!conversationId || !chatText.trim() || !profile) return;
    const body = chatText.trim();
    setSendingChat(true);

    if (chatEditingId) {
      const { error } = await supabase
        .from('chat_messages')
        .update({ body, edited_at: new Date().toISOString() })
        .eq('id', chatEditingId);
      setSendingChat(false);
      if (error) {
        alert(error.message);
      } else {
        setChatEditingId(null);
        setChatText('');
      }
      return;
    }

    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      body
    });
    setSendingChat(false);
    if (error) {
      alert(error.message);
    } else {
      setChatText('');
    }
  }

  return (
    <div className="page-container space-y-6">
      <div className="page-header">
        <h1 className="page-title">Group Channels & Chat</h1>
        <p className="page-subtitle">Create, manage, and engage in duplex group chat channels.</p>
      </div>

      {msg ? (
        <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${
          msg.toLowerCase().includes('error') 
            ? 'border-rose-100 bg-rose-50 text-rose-700' 
            : 'border-green-100 bg-green-50 text-green-700'
        }`} role="alert">
          {msg}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: List & Form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Create group form */}
          {can('manage_groups') ? (
          <form onSubmit={handleCreate} className="card" aria-label="Create new group">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-bold text-slate-900">Create New Group</h2>
              </div>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label className="label" htmlFor="group-name">Group Name</label>
                <input
                  id="group-name"
                  className="input"
                  placeholder="Study Group A, Math Club, etc."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  aria-required="true"
                />
              </div>

              <div>
                <label className="label" htmlFor="group-desc">Description</label>
                <textarea
                  id="group-desc"
                  className="textarea"
                  placeholder="Describe the purpose of this group..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <label className="label" htmlFor="group-type">Visibility Type</label>
                <select
                  id="group-type"
                  className="select"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>

              <div>
                <label className="label" htmlFor="group-rules">Membership Rules</label>
                <input
                  id="group-rules"
                  className="input"
                  placeholder="E.g., Open to coordinators only."
                  value={membershipRules}
                  onChange={(e) => setMembershipRules(e.target.value)}
                />
              </div>

              <button type="submit" className="btn-primary w-full">
                <Plus className="h-4 w-4" />
                Create Group
              </button>
            </div>
          </form>
          ) : (
            <div className="card">
              <div className="card-body">
                <p className="text-sm text-slate-500">
                  Teachers can join public groups but cannot create or manage them.
                </p>
              </div>
            </div>
          )}

          {/* Group list sidebar */}
          <div className="card" aria-label="Group list">
            <div className="card-header">
              <h2 className="text-sm font-bold text-slate-900">My Group Channels</h2>
            </div>
            <nav className="divide-y divide-slate-100" role="list">
              {groups.length === 0 ? (
                <div className="empty-state py-8">
                  <Users className="empty-state-icon" />
                  <p className="empty-state-title">No groups yet</p>
                  <p className="empty-state-desc">Create or join a group to get started.</p>
                </div>
              ) : (
                groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full px-4 py-3.5 text-left transition-all ${
                      selectedGroupId === g.id
                        ? 'bg-green-50/50 border-l-4 border-l-blue-600'
                        : 'border-l-4 border-l-transparent hover:bg-slate-50'
                    }`}
                    role="listitem"
                    aria-current={selectedGroupId === g.id ? 'true' : undefined}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 truncate">
                        {g.name}
                        {(unreadByGroupId[g.id] ?? 0) > 0 ? (
                          <span className="badge-rose text-[10px] px-1.5 py-0.5" aria-label={`${unreadByGroupId[g.id]} unread messages`}>
                            {unreadByGroupId[g.id] > 9 ? '9+' : unreadByGroupId[g.id]}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 mt-0.5" aria-label={g.type === 'private' ? 'Private group' : 'Public group'}>
                        {g.type === 'private' ? (
                          <Lock className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <Unlock className="h-3.5 w-3.5 text-slate-400" />
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {g.description ? (
                        <span className="text-xs text-slate-500 line-clamp-1">{g.description}</span>
                      ) : null}
                      {g.creator_role && (
                        <span className="badge-slate text-[10px] shrink-0">{g.creator_role}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </nav>
          </div>
        </div>

        {/* Right columns: Group Panel */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="card flex flex-col h-[500px] lg:h-[700px]" aria-label="Group details">
              {/* Selected Group Header */}
              <div className="card-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900 truncate">{selected.name}</h2>
                    <span className={`badge capitalize ${
                      selected.type === 'private' ? 'badge-amber' : 'badge-green'
                    }`}>
                      {selected.type}
                    </span>
                  </div>
                  {selected.description && <p className="text-sm text-slate-500 mt-1">{selected.description}</p>}
                  {selected.membership_rules && (
                    <p className="text-xs text-slate-400 mt-0.5">Rules: {selected.membership_rules}</p>
                  )}
                </div>

                <div className="tabs" role="tablist" aria-label="Group panel tabs">
                  <button
                    role="tab"
                    aria-selected={activePanelTab === 'members'}
                    onClick={() => setActivePanelTab('members')}
                    className={`tab flex items-center gap-2 ${activePanelTab === 'members' ? 'tab-active' : ''}`}
                  >
                    <Users className="h-4 w-4" />
                    Members ({members.length})
                  </button>
                  <button
                    role="tab"
                    aria-selected={activePanelTab === 'chat'}
                    onClick={() => setActivePanelTab('chat')}
                    className={`tab flex items-center gap-2 ${activePanelTab === 'chat' ? 'tab-active' : ''}`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat Room
                  </button>
                </div>
              </div>

              {/* Panel Content */}
              <div className="flex-1 flex flex-col min-h-0">
                {activePanelTab === 'members' ? (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Settings / Edit */}
                    {(can('manage_groups') && (selected.created_by === profile?.id || profile?.role === 'admin')) && (
                      <section className="card border-slate-100" aria-label="Group management">
                        <div className="card-header">
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <Settings className="h-4 w-4 text-slate-500" />
                            Group Management
                          </h3>
                        </div>
                        <div className="card-body space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="label text-xs">Name</label>
                              <input
                                className="input"
                                value={selected.name}
                                onChange={(e) =>
                                  setGroups((prev) =>
                                    prev.map((g) => (g.id === selected.id ? { ...g, name: e.target.value } : g))
                                  )
                                }
                              />
                            </div>
                            <div>
                              <label className="label text-xs">Description</label>
                              <input
                                className="input"
                                value={selected.description ?? ''}
                                onChange={(e) =>
                                  setGroups((prev) =>
                                    prev.map((g) => (g.id === selected.id ? { ...g, description: e.target.value } : g))
                                  )
                                }
                              />
                            </div>
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <button
                              type="button"
                              onClick={handleUpdate}
                              className="btn-primary btn-sm"
                            >
                              Save Settings
                            </button>
                            <button
                              type="button"
                              onClick={handleDelete}
                              className="btn-danger btn-sm"
                            >
                              Delete Group
                            </button>
                          </div>
                        </div>
                      </section>
                    )}

                    {/* Add Member */}
                    {can('manage_groups') && (selected.created_by === profile?.id || profile?.role === 'admin') && (
                      <section aria-label="Add new member">
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <label className="label" htmlFor="add-member-select">Add New Member</label>
                            <select
                              id="add-member-select"
                              className="select"
                              value={addUserId}
                              onChange={(e) => setAddUserId(e.target.value)}
                              aria-label="Select user to add"
                            >
                              <option value="">Choose user...</option>
                              {selectableUsers
                                .filter((user) => !members.some((m) => m.teacher_id === user.id))
                                .map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.display_name} ({u.role.toUpperCase()})
                                  </option>
                                ))}
                            </select>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddMember}
                            className="btn-primary btn-sm mt-6"
                            aria-label="Add selected member"
                          >
                            + Add Member
                          </button>
                        </div>
                      </section>
                    )}

                    {/* Members List */}
                    <section aria-label="Group members">
                      <h3 className="text-sm font-bold text-slate-800 mb-3">Group Members ({members.length})</h3>
                      {members.length === 0 ? (
                        <div className="empty-state py-8">
                          <Users className="empty-state-icon" />
                          <p className="empty-state-title">No members yet</p>
                          <p className="empty-state-desc">Add members from the section above.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="list">
                          {members.map((m) => {
                            const roleClass = m.role === 'admin' ? 'role-admin' 
                              : m.role === 'coordinator' ? 'role-coordinator'
                              : m.role === 'teacher' ? 'role-teacher'
                              : 'role-student';
                            return (
                              <div
                                key={m.id}
                                className="flex items-center justify-between rounded-lg border border-slate-100 bg-white px-4 py-3 hover:shadow-sm transition-shadow"
                                role="listitem"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <div className="avatar-sm" aria-hidden="true">
                                    {m.display_name.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-slate-900 text-sm truncate">{m.display_name}</p>
                                    <span className={roleClass}>{m.role}</span>
                                  </div>
                                </div>
                                {can('manage_groups') && (selected.created_by === profile?.id || profile?.role === 'admin') && m.teacher_id !== selected.created_by && (
                                  <button
                                    type="button"
                                    className="btn-ghost btn-sm text-rose-600 hover:text-rose-700"
                                    onClick={() => handleRemoveMember(m.teacher_id)}
                                    aria-label={`Remove ${m.display_name}`}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {profile?.id === m.teacher_id && profile?.id !== selected.created_by && (
                                  <button
                                    type="button"
                                    className="btn-ghost btn-sm text-rose-600 hover:text-rose-700"
                                    onClick={() => handleRemoveMember(m.teacher_id)}
                                    aria-label="Leave group"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    Leave
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  /* Chat Room */
                  <div className="flex-1 flex flex-col bg-slate-50 min-h-0">
                    {/* Message Area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" role="log" aria-label="Chat messages" aria-live="polite">
                      {chatMessages.length === 0 ? (
                        <div className="empty-state h-full min-h-[300px]">
                          <MessageSquare className="empty-state-icon" />
                          <p className="empty-state-title">No messages yet</p>
                          <p className="empty-state-desc">Send a message to start the conversation.</p>
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isMe = msg.sender_id === profile?.id;
                          const deleted = !!msg.deleted_at;
                          const isEdited = msg.edited_at && msg.edited_at !== msg.created_at;
                          const isAdmin = profile?.role === 'admin';
                          return (
                            <div key={msg.id} className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <div className="flex items-center gap-2 mb-1 px-1">
                                {!isMe && (
                                  <span className="text-xs font-medium text-slate-500">
                                    {msg.sender?.display_name ?? 'User'}
                                    {msg.sender?.role ? ` · ${msg.sender.role}` : ''}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className={`max-w-[75%] ${
                                isMe ? 'chat-message-me' : 'chat-message-other'
                              } ${deleted ? 'opacity-60' : ''}`}>
                                {deleted ? (
                                  <p className="whitespace-pre-wrap break-words text-sm italic text-slate-500">Message deleted</p>
                                ) : (
                                  <>
                                    <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                                    {isEdited && <p className="text-[10px] mt-0.5 opacity-70">· edited</p>}
                                  </>
                                )}
                                {!deleted && (isMe || isAdmin) && (
                                  <div className={`flex gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${isMe ? 'justify-end' : 'justify-start'}`}>
                                    {isMe && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setChatEditingId(msg.id);
                                          setChatText(msg.body);
                                        }}
                                        className="text-[10px] p-0.5 rounded hover:bg-black/10"
                                        aria-label="Edit message"
                                      >
                                        <Edit2 className="h-3 w-3" />
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!confirm('Delete this message?')) return;
                                        await supabase
                                          .from('chat_messages')
                                          .update({ deleted_at: new Date().toISOString(), body: 'Message deleted' })
                                          .eq('id', msg.id);
                                        const { data: msgs } = await supabase
                                          .from('chat_messages')
                                          .select('id, sender_id, body, created_at, edited_at, deleted_at, sender:profiles!chat_messages_sender_id_fkey(display_name, role)')
                                          .eq('conversation_id', conversationId)
                                          .order('created_at', { ascending: true });
                                        setChatMessages(msgs || []);
                                      }}
                                      className="text-[10px] p-0.5 rounded hover:bg-black/10 text-rose-600"
                                      aria-label="Delete message"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Chat Input */}
                    <div className="card-footer bg-white">
                      {chatEditingId && (
                        <div className="mb-2 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-600">
                          <Edit2 className="h-3.5 w-3.5" />
                          <span className="flex-1">Editing message</span>
                          <button
                            type="button"
                            onClick={() => { setChatEditingId(null); setChatText(''); }}
                            className="shrink-0 rounded p-0.5 hover:bg-blue-100"
                            aria-label="Cancel editing"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <input
                          className="input"
                          placeholder={chatEditingId ? 'Edit message…' : 'Type your message here...'}
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleSendChat();
                            }
                          }}
                          aria-label="Chat message input"
                        />
                        <button
                          type="button"
                          disabled={sendingChat || !chatText.trim()}
                          onClick={handleSendChat}
                          className="btn-primary shrink-0"
                          aria-label={chatEditingId ? 'Save edit' : 'Send message'}
                        >
                          {sendingChat ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : chatEditingId ? (
                            <Check className="h-4 w-4" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          {chatEditingId ? 'Save' : 'Send'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="card min-h-[400px]">
              <div className="empty-state h-full min-h-[400px]">
                <Users className="empty-state-icon h-16 w-16 text-slate-200" />
                <p className="empty-state-title text-lg">No Group Selected</p>
                <p className="empty-state-desc">Choose a group from the list to view members and chat.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
