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
} from '../lib/features';
import type { Group } from '../lib/features';
import { useAuth } from '../core/auth/AuthContext';
import { MessageSquare, Users, Settings, Lock, Unlock, Send, Loader2 } from 'lucide-react';

export function GroupsPage() {
  const { profile } = useAuth();
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
  const [sendingChat, setSendingChat] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = groups.find((g) => g.id === selectedGroupId) ?? null;

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
        // Teachers can only add assigned students
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
        // Admin & Coordinators (RLS automatically filters coordinators to their scope)
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
        .select('id, sender_id, body, created_at, sender:profiles!chat_messages_sender_id_fkey(display_name, role)')
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

  // Realtime subscription for group chat
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`group_chat:${conversationId}`)
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
            .select('id, sender_id, body, created_at, sender:profiles!chat_messages_sender_id_fkey(display_name, role)')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              setChatMessages(data || []);
            });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages, activePanelTab]);

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
    setSendingChat(true);
    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_id: profile.id,
      body: chatText.trim()
    });
    setSendingChat(false);
    if (error) {
      alert(error.message);
    } else {
      setChatText('');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Group Channels & Chat</h2>
        <p className="text-slate-500">Create, manage, and engage in duplex group chat channels.</p>
      </div>

      {msg ? (
        <p className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm font-medium text-blue-800">
          {msg}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: List & Form */}
        <div className="lg:col-span-1 space-y-6">
          {/* Create group form */}
          <form onSubmit={handleCreate} className="gc-card space-y-4 p-5 bg-white border border-slate-100 rounded-xl">
            <h3 className="font-bold text-slate-900 text-lg">Create New Group</h3>
            
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Group Name</label>
              <input
                className="gc-input"
                placeholder="Study Group A, Math Club, etc."
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Description</label>
              <textarea
                className="gc-input resize-none"
                placeholder="Describe the purpose of this group..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-500">Visibility Type</label>
                <select
                  className="gc-input"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-500">Membership Rules</label>
              <input
                className="gc-input"
                placeholder="E.g., Open to coordinators only."
                value={membershipRules}
                onChange={(e) => setMembershipRules(e.target.value)}
              />
            </div>

            <button type="submit" className="gc-btn-primary w-full">
              Create Group
            </button>
          </form>

          {/* Group list */}
          <div className="gc-card overflow-hidden bg-white border border-slate-100 rounded-xl">
            <div className="bg-slate-50 border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-800 text-sm">My Group Channels</h3>
            </div>
            <ul className="divide-y divide-slate-100">
              {groups.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-slate-400">No groups joined or created yet.</li>
              ) : (
                groups.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(g.id)}
                      className={`w-full px-4 py-4 text-left transition hover:bg-slate-50/70 ${
                        selectedGroupId === g.id
                          ? 'border-l-4 border-l-green-500 bg-green-50/30'
                          : ''
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          {g.name}
                          {g.type === 'private' ? (
                            <Lock className="h-3.5 w-3.5 text-slate-400" />
                          ) : (
                            <Unlock className="h-3.5 w-3.5 text-slate-400" />
                          )}
                        </span>
                        {g.creator_role && (
                          <span className="text-[10px] uppercase font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {g.creator_role}
                          </span>
                        )}
                      </div>
                      {g.description ? (
                        <div className="text-xs text-slate-500 mt-1 line-clamp-1">{g.description}</div>
                      ) : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        {/* Right columns: Group Panel (Members list / Group Chat) */}
        <div className="lg:col-span-2">
          {selected ? (
            <div className="gc-card bg-white border border-slate-100 rounded-xl overflow-hidden flex flex-col h-[700px]">
              {/* Selected Group Header */}
              <div className="bg-slate-50 border-b border-slate-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-lg">{selected.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      selected.type === 'private' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-green-50 text-green-700 border border-green-100'
                    }`}>
                      {selected.type}
                    </span>
                  </div>
                  {selected.description && <p className="text-slate-500 text-xs mt-1">{selected.description}</p>}
                  {selected.membership_rules && (
                    <p className="text-slate-400 text-[10px] mt-1 italic">Rules: {selected.membership_rules}</p>
                  )}
                </div>

                <div className="flex gap-2 border-b sm:border-b-0 border-slate-100">
                  <button
                    onClick={() => setActivePanelTab('members')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 ${
                      activePanelTab === 'members' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    Members ({members.length})
                  </button>
                  <button
                    onClick={() => setActivePanelTab('chat')}
                    className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 ${
                      activePanelTab === 'chat' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <MessageSquare className="h-4 w-4" />
                    Chat Room
                  </button>
                </div>
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-hidden flex flex-col">
                {activePanelTab === 'members' ? (
                  <div className="p-6 overflow-y-auto space-y-6 flex-1">
                    {/* Settings / Edit (Only for creator or admin) */}
                    {(profile?.role === 'admin' || profile?.id === selected.created_by) && (
                      <div className="space-y-3 p-4 bg-slate-50/70 border border-slate-150 rounded-xl">
                        <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                          <Settings className="h-4 w-4 text-slate-500" />
                          Group Management
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Rename</label>
                            <input
                              className="gc-input bg-white"
                              value={selected.name}
                              onChange={(e) =>
                                setGroups((prev) =>
                                  prev.map((g) => (g.id === selected.id ? { ...g, name: e.target.value } : g))
                                )
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Description</label>
                            <input
                              className="gc-input bg-white"
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
                            className="gc-btn-primary text-xs py-1.5"
                          >
                            Save Settings
                          </button>
                          <button
                            type="button"
                            onClick={handleDelete}
                            className="gc-btn-secondary border-red-200 text-xs py-1.5 text-red-600"
                          >
                            Delete Group
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Add Member section */}
                    {(profile?.role === 'admin' || profile?.id === selected.created_by) && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-slate-900 text-sm">Add New Member</h4>
                        <div className="flex gap-2">
                          <select
                            className="gc-input flex-1"
                            value={addUserId}
                            onChange={(e) => setAddUserId(e.target.value)}
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
                          <button
                            type="button"
                            onClick={handleAddMember}
                            className="shrink-0 rounded-xl bg-slate-850 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-750"
                          >
                            Add Member
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Members List */}
                    <div className="space-y-2">
                      <h4 className="font-semibold text-slate-900 text-sm">Group Members</h4>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {members.length === 0 ? (
                          <li className="text-slate-400 text-sm italic">No members in this group yet.</li>
                        ) : (
                          members.map((m) => (
                            <li
                              key={m.id}
                              className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                            >
                              <div>
                                <span className="font-semibold text-slate-900 text-sm">{m.display_name}</span>
                                <span className="ml-2 text-[9px] uppercase font-bold text-slate-400 bg-white border border-slate-100 px-1 rounded">
                                  {m.role}
                                </span>
                              </div>
                              {/* Creator or admin can remove members, but cannot remove self unless leaving */}
                              {(profile?.role === 'admin' || profile?.id === selected.created_by) && m.teacher_id !== selected.created_by && (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-red-500 hover:text-red-700"
                                  onClick={() => handleRemoveMember(m.teacher_id)}
                                >
                                  Remove
                                </button>
                              )}
                              {/* Self leaving */}
                              {profile?.id === m.teacher_id && profile?.id !== selected.created_by && (
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-red-500 hover:text-red-700"
                                  onClick={() => handleRemoveMember(m.teacher_id)}
                                >
                                  Leave Group
                                </button>
                              )}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>
                  </div>
                ) : (
                  /* Chat Room panel */
                  <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
                    {/* Message Area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                      {chatMessages.length === 0 ? (
                        <div className="h-full flex flex-col justify-center items-center py-20 text-slate-400">
                          <MessageSquare className="h-10 w-10 text-slate-300 mb-2" />
                          <p className="text-sm">No messages in this group yet.</p>
                          <p className="text-xs text-slate-400">Send a message to start the conversation.</p>
                        </div>
                      ) : (
                        chatMessages.map((msg) => {
                          const isMe = msg.sender_id === profile?.id;
                          return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                              <div className="flex items-center gap-2 mb-1">
                                {!isMe && (
                                  <span className="text-xs font-bold text-slate-700">
                                    {msg.sender?.role ? `[${msg.sender.role.toUpperCase()}] ` : ''}
                                    {msg.sender?.display_name ?? 'User'}
                                  </span>
                                )}
                                <span className="text-[9px] text-slate-450">
                                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
                                isMe ? 'bg-green-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                              }`}>
                                <p className="whitespace-pre-wrap">{msg.body}</p>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Chat Input */}
                    <div className="bg-white border-t border-slate-100 p-4">
                      <div className="flex gap-2">
                        <input
                          className="gc-input flex-1"
                          placeholder="Type your message here..."
                          value={chatText}
                          onChange={(e) => setChatText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleSendChat();
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={sendingChat || !chatText.trim()}
                          onClick={handleSendChat}
                          className="shrink-0 rounded-xl bg-green-600 px-4 py-2 font-bold text-white hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {sendingChat ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Send
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[400px] flex flex-col justify-center items-center bg-white border border-slate-100 rounded-xl text-slate-400">
              <Users className="h-12 w-12 text-slate-200 mb-2" />
              <p className="font-semibold">No Group Selected</p>
              <p className="text-xs">Choose or create a group from the list to view chat and members.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
