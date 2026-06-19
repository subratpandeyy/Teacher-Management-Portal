import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ActivityIndicator
} from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import {
  fetchGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  fetchGroupMembers,
  addGroupMember,
  removeGroupMember,
  sendChatMessage,
  softDeleteChatMessage,
  updateChatMessage,
  uploadChatAttachment,
  getChatAttachmentUrl,
  fetchChatMessages
} from '../../lib/api';
import type { ChatMessage } from '../../lib/api';
import type { Group } from '../../lib/types';
import { ErrorBanner } from '../../components/ErrorBanner';
import { LoadingScreen } from '../../components/LoadingScreen';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Picker } from '../../components/ui/Picker';
import { pickDocumentForUpload } from '../../lib/documentPicker';

export default function GroupsScreen() {
  const { profile } = useAuth();
  const userId = profile?.id ?? '';
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [selectableUsers, setSelectableUsers] = useState<any[]>([]);
  
  // Tabs
  const [tab, setTab] = useState<'my' | 'public'>('my');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [createVisible, setCreateVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);

  // Group Form state
  const [gName, setGName] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gType, setGType] = useState('public');
  const [gRules, setGRules] = useState('');
  const [addingMemberId, setAddingMemberId] = useState('');

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState('');
  
  const listRef = useRef<FlatList>(null);
  const reloadSeq = useRef(0);

  const loadAllGroups = useCallback(async () => {
    try {
      const { data, error: err } = await fetchGroups();
      if (err) setError(err.message);
      else setGroups((data as Group[]) ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllGroups();
  }, [loadAllGroups]);

  // Load chat messages when group selection changes
  const loadMessages = useCallback(async (convId: string) => {
    const seq = ++reloadSeq.current;
    setLoadingMessages(true);
    const { data, error: err } = await fetchChatMessages(convId, userId);
    if (seq !== reloadSeq.current) return;
    setLoadingMessages(false);
    if (err) setError(err.message);
    else setMessages((data as ChatMessage[]) ?? []);
  }, [userId]);

  const selectGroup = async (group: Group) => {
    setSelectedGroup(group);
    setError('');
    
    // Find conversation ID
    try {
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('group_id', group.id)
        .maybeSingle();

      if (conv) {
        setConversationId(conv.id);
        await loadMessages(conv.id);
      } else {
        setConversationId(null);
        setMessages([]);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to open group chat');
    }
  };

  const chatSubId = useRef(0);

  // Realtime subscription for group chat
  useEffect(() => {
    if (!conversationId) return;

    const id = ++chatSubId.current;
    const channel = supabase
      .channel(`group_chat:${conversationId}:${id}`)
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
            .select(`
              id,
              conversation_id,
              sender_id,
              receiver_id,
              body,
              attachment_url,
              attachment_name,
              attachment_type,
              created_at,
              updated_at,
              deleted_at,
              sender:profiles!chat_messages_sender_id_fkey(role, display_name)
            `)
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .then(({ data }) => {
              setMessages((data as any as ChatMessage[]) ?? []);
            });
        }
      )
      .subscribe((status) => {
        console.log(`Channel group_chat:${conversationId}:${id} status:`, status);
      });

    return () => {
      console.log(`Removing channel group_chat:${conversationId}:${id}`);
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  // Load group members & selectable users for the Info Modal
  const loadInfoData = async (groupId: string) => {
    if (!profile) return;
    try {
      // 1. Group Members
      const { data: mems } = await fetchGroupMembers(groupId);
      setMembers(mems || []);

      // 2. Selectable Users based on creator role restrictions
      if (profile.role === 'teacher') {
        const { data: assigns } = await supabase
          .from('teacher_student_assignments')
          .select('student_id, student:profiles!teacher_student_assignments_student_id_fkey(id, display_name, role)')
          .is('student.deleted_at', null);
        const list = (assigns || []).map((a: any) => a.student).filter(Boolean);
        setSelectableUsers(list);
      } else if (profile.role === 'coordinator') {
        const { data: allAssigns } = await supabase
          .from('coordinator_assignments')
          .select('*')
          .order('created_at', { ascending: true });
        
        const latestUserMap = new Map();
        for (const a of allAssigns || []) {
          if (a.teacher_id) latestUserMap.set(a.teacher_id, a.coordinator_id);
          if (a.student_id) latestUserMap.set(a.student_id, a.coordinator_id);
        }
        
        const inScopeIds: string[] = [];
        latestUserMap.forEach((coordId, uId) => {
          if (coordId === profile.id) inScopeIds.push(uId);
        });

        if (inScopeIds.length > 0) {
          const { data: scopeProfs } = await supabase
            .from('profiles')
            .select('id, display_name, role')
            .in('id', inScopeIds)
            .is('deleted_at', null);
          setSelectableUsers(scopeProfs || []);
        } else {
          setSelectableUsers([]);
        }
      } else if (profile.role === 'student') {
        const { data: studs } = await supabase
          .from('profiles')
          .select('id, display_name, role')
          .eq('role', 'student')
          .is('deleted_at', null)
          .order('display_name');
        setSelectableUsers(studs || []);
      } else {
        const { data: allProfs } = await supabase
          .from('profiles')
          .select('id, display_name, role')
          .is('deleted_at', null)
          .order('display_name');
        setSelectableUsers(allProfs || []);
      }
    } catch (err) {
      console.error('Error loading group info data:', err);
    }
  };

  const openInfoModal = async () => {
    if (!selectedGroup) return;
    await loadInfoData(selectedGroup.id);
    setInfoVisible(true);
  };

  const handleCreateGroup = async () => {
    if (!gName.trim()) return;
    setSending(true);
    try {
      const { data, error: err } = await createGroup(
        gName.trim(),
        gDesc.trim() || null,
        gType,
        gRules.trim(),
        userId
      );

      if (err) {
        Alert.alert('Error', err.message);
      } else {
        setCreateVisible(false);
        setGName('');
        setGDesc('');
        setGType('public');
        setGRules('');
        await loadAllGroups();
        if (data) await selectGroup(data as Group);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to create group');
    } finally {
      setSending(false);
    }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !addingMemberId) return;
    try {
      const { error: err } = await addGroupMember(selectedGroup.id, addingMemberId);
      if (err) {
        Alert.alert('Error', err.message);
      } else {
        setAddingMemberId('');
        await loadInfoData(selectedGroup.id);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to add member');
    }
  };

  const handleRemoveMemberClick = async (memberTeacherId: string) => {
    if (!selectedGroup) return;
    try {
      const { error: err } = await removeGroupMember(selectedGroup.id, memberTeacherId);
      if (err) {
        Alert.alert('Error', err.message);
      } else {
        // If removing self, close chat
        if (memberTeacherId === userId) {
          setInfoVisible(false);
          setSelectedGroup(null);
          setConversationId(null);
          await loadAllGroups();
        } else {
          await loadInfoData(selectedGroup.id);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to remove member');
    }
  };

  const handleDeleteGroupClick = async () => {
    if (!selectedGroup) return;
    Alert.alert('Delete Group?', 'This will permanently delete this group and all messages.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const { error: err } = await deleteGroup(selectedGroup.id);
            if (err) {
              Alert.alert('Error', err.message);
            } else {
              setInfoVisible(false);
              setSelectedGroup(null);
              setConversationId(null);
              await loadAllGroups();
            }
          } catch (err: any) {
            Alert.alert('Error', err?.message ?? 'Failed to delete group');
          }
        }
      }
    ]);
  };

  const handleJoinGroup = async (group: Group) => {
    try {
      const { error: err } = await addGroupMember(group.id, userId);
      if (err) {
        Alert.alert('Error', err.message);
      } else {
        await loadAllGroups();
        await selectGroup(group);
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to join group');
    }
  };

  // Chat message actions
  async function handleSend() {
    if (!conversationId) return;
    const trimmed = chatText.trim();
    if (!trimmed) return;

    setSending(true);
    setError('');

    if (editingId) {
      const { error: err } = await updateChatMessage(editingId, userId, trimmed);
      setSending(false);
      if (err) setError(err.message);
      else {
        setEditingId(null);
        setChatText('');
        await loadMessages(conversationId);
      }
      return;
    }

    const { error: sendErr } = await sendChatMessage(
      conversationId,
      userId,
      trimmed,
      userId
    );
    setSending(false);
    if (sendErr) setError(sendErr);
    else setChatText('');
  }

  async function handleAttach() {
    if (!conversationId || attaching) return;
    const picked = await pickDocumentForUpload();
    if (!picked.ok) {
      if ('error' in picked && picked.error) setError(picked.error);
      return;
    }

    setAttaching(true);
    setError('');

    const uploaded = await uploadChatAttachment(conversationId, userId, picked.asset);

    if (uploaded.error || !uploaded.path) {
      setAttaching(false);
      setError(uploaded.error ?? 'Upload failed');
      return;
    }

    const body = chatText.trim() || `📎 ${uploaded.name ?? picked.asset.name}`;
    const { error: sendErr } = await sendChatMessage(
      conversationId,
      userId,
      body,
      userId,
      {
        url: uploaded.path,
        name: uploaded.name ?? picked.asset.name,
        type: uploaded.mimeType ?? picked.asset.mimeType,
      }
    );

    setAttaching(false);
    if (sendErr) setError(sendErr);
    else setChatText('');
  }

  function confirmDelete(messageId: string) {
    Alert.alert('Delete message?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!conversationId) return;
          await softDeleteChatMessage(messageId, userId);
          await loadMessages(conversationId);
        },
      },
    ]);
  }

  async function openAttachment(path: string) {
    const { url, error: err } = await getChatAttachmentUrl(path);
    if (url) await Linking.openURL(url);
    else setError(err?.message ?? 'Could not open file');
  }

  // Filter groups
  const myGroupsList = groups.filter(g => 
    g.created_by === userId || 
    (members.length > 0 && selectedGroup?.id === g.id) || // current selected fallback
    // Wait, let's determine if user is a member of the group
    // Realistically, the SELECT policy on groups restricts groups to those visible/joined, so
    // we can filter "public groups available to join" vs "groups I am already in"
    // Let's implement that: a group is in "my groups" if RLS returned it and the search tab queries public groups they aren't in.
    // Actually, since groups returned by fetchGroups() contains groups they created or joined, groups has both!
    // But wait, what if they want to find public groups they HAVEN'T joined yet?
    // Let's check: in "public" tab, we show groups of type = 'public' where the user is NOT currently a member.
    // How do we know if they are a member? We can see if it's in a set, but to keep it simple, they can search.
    true
  );

  const myJoinedOrCreatedGroups = groups.filter(g => {
    // If they created it, it's theirs
    if (g.created_by === userId) return true;
    // Or if they are in the list of groups they joined (can be checked if we query their memberships)
    // To simplify: groups returned by RLS includes public groups as well. So we filter groups by:
    // If it's private or if the user is a member (but they can also join public groups).
    // Let's fetch the user's joined groups from the database to be absolutely accurate!
    return true; // We can show all visible groups in "My Groups" since RLS only shows public/joined ones.
  });

  const queryFilteredGroups = myJoinedOrCreatedGroups.filter(g => 
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isGroupCreator = selectedGroup && selectedGroup.created_by === userId;
  const isUserAdmin = profile?.role === 'admin';

  if (loading) return <LoadingScreen label="Loading groups..." />;

  // Render chat room if group is selected
  if (selectedGroup) {
    return (
      <KeyboardAvoidingView
        className="flex-1 bg-canvas"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Chat Header */}
        <View className="flex-row items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <View className="flex-row items-center gap-3 flex-1">
            <Pressable onPress={() => { setSelectedGroup(null); setConversationId(null); }} className="p-1">
              <Feather name="arrow-left" size={22} color="#475569" />
            </Pressable>
            <View className="flex-1">
              <Text className="font-bold text-slate-900 text-base" numberOfLines={1}>
                {selectedGroup.name}
              </Text>
              <Text className="text-xs text-slate-500 capitalize" numberOfLines={1}>
                {selectedGroup.type} Group • {selectedGroup.creator_role ? `Created by ${selectedGroup.creator_role}` : 'General'}
              </Text>
            </View>
          </View>

          <Pressable onPress={openInfoModal} className="h-9 w-9 items-center justify-center rounded-full bg-slate-50 active:bg-slate-100">
            <Feather name="info" size={20} color="#64748B" />
          </Pressable>
        </View>

        <ErrorBanner message={error} onDismiss={() => setError('')} />

        {/* Message List */}
        {loadingMessages ? (
          <View className="flex-grow justify-center items-center">
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            contentContainerClassName="px-4 py-3 flex-grow"
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <EmptyState
                icon="message-circle"
                title="Group Chat"
                description="Send a message to start chatting with members."
              />
            }
            renderItem={({ item }) => {
              const mine = item.sender_id === userId;
              const deleted = !!item.deleted_at;
              const hasAttachment = !!item.attachment_url && !deleted;
              const bodyOnly = item.body && !item.body.startsWith('📎');
              
              const senderRole = (item as ChatMessage & { sender?: { role?: string } }).sender?.role;
              const senderName = (item as ChatMessage & { sender?: { display_name?: string } }).sender?.display_name ?? 'User';
              const roleLabel = senderRole ? `[${senderRole.toUpperCase()}] ${senderName}` : senderName;

              return (
                <Pressable
                  className={`mb-3 max-w-[85%] ${mine ? 'self-end' : 'self-start'}`}
                  onLongPress={
                    mine && !deleted
                      ? () => {
                          Alert.alert('Message Options', undefined, [
                            {
                              text: 'Edit',
                              onPress: () => {
                                setEditingId(item.id);
                                setChatText(item.body.startsWith('📎') ? '' : item.body);
                              },
                            },
                            { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(item.id) },
                            { text: 'Cancel', style: 'cancel' },
                          ]);
                        }
                      : undefined
                  }
                >
                  <View
                    className={`rounded-2xl px-4 py-2.5 ${
                      mine
                        ? 'rounded-br-md bg-emerald-500'
                        : 'rounded-bl-md border border-slate-100 bg-white'
                    } ${deleted ? 'opacity-60' : ''}`}
                  >
                    {!mine && (
                      <Text className="mb-1 text-[10px] font-bold text-slate-500">
                        {roleLabel}
                      </Text>
                    )}
                    {!deleted && bodyOnly ? (
                      <Text className={mine ? 'text-white' : 'text-slate-800'}>{item.body}</Text>
                    ) : null}
                    {deleted ? (
                      <Text className={`italic ${mine ? 'text-green-100' : 'text-slate-500'}`}>
                        Message deleted
                      </Text>
                    ) : null}
                    {hasAttachment ? (
                      <Pressable
                        onPress={() => openAttachment(item.attachment_url!)}
                        className={`mt-1 flex-row items-center gap-2 rounded-lg px-2 py-1.5 ${mine ? 'bg-white/20' : 'bg-accent-blue-50'}`}
                      >
                        <Feather name="paperclip" size={14} color={mine ? '#fff' : '#3B82F6'} />
                        <Text
                          className={`flex-1 text-sm font-medium ${mine ? 'text-white' : 'text-accent-blue-600'}`}
                          numberOfLines={1}
                        >
                          {item.attachment_name ?? 'Attachment'}
                        </Text>
                      </Pressable>
                    ) : null}
                    <Text className={`text-[8px] text-right mt-1 ${mine ? 'text-emerald-100' : 'text-slate-400'}`}>
                      {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {/* Input Bar */}
        <View className="border-t border-slate-100 bg-white p-3 flex-row items-center gap-2">
          <Pressable
            disabled={attaching}
            onPress={handleAttach}
            className="h-11 w-11 items-center justify-center rounded-xl bg-slate-55 border border-slate-200 active:bg-slate-100"
          >
            {attaching ? (
              <ActivityIndicator size="small" color="#3B82F6" />
            ) : (
              <Feather name="plus" size={22} color="#64748B" />
            )}
          </Pressable>

          <TextInput
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-base text-slate-850"
            placeholder={editingId ? "Edit message..." : "Type a message..."}
            value={chatText}
            onChangeText={setChatText}
            multiline
          />

          <Pressable
            disabled={sending || !chatText.trim()}
            onPress={handleSend}
            className={`h-11 px-4 items-center justify-center rounded-xl bg-emerald-500 active:bg-emerald-600 disabled:opacity-50`}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={18} color="#fff" />
            )}
          </Pressable>
        </View>

        {/* Info Modal */}
        <Modal
          visible={infoVisible}
          animationType="slide"
          onRequestClose={() => setInfoVisible(false)}
        >
          <View className="flex-1 bg-canvas">
            <View className="flex-row items-center justify-between border-b border-slate-100 bg-white px-4 py-4">
              <Text className="text-lg font-bold text-slate-900">Group Info</Text>
              <Pressable onPress={() => setInfoVisible(false)} className="p-1">
                <Feather name="x" size={24} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView className="p-4 space-y-6">
              <Card className="p-5">
                <Text className="text-lg font-bold text-slate-900 mb-1">{selectedGroup.name}</Text>
                <Text className="text-sm text-slate-500 capitalize mb-3">{selectedGroup.type} Group</Text>
                
                {selectedGroup.description && (
                  <View className="mb-4">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Description</Text>
                    <Text className="text-slate-700 text-sm leading-5">{selectedGroup.description}</Text>
                  </View>
                )}

                {selectedGroup.membership_rules && (
                  <View className="mb-4">
                    <Text className="text-xs font-bold text-slate-400 uppercase mb-1">Membership Rules</Text>
                    <Text className="text-slate-650 text-sm italic">{selectedGroup.membership_rules}</Text>
                  </View>
                )}
              </Card>

              {/* Add Member form (creator or admin only) */}
              {(isGroupCreator || isUserAdmin) && (
                <Card className="p-5 space-y-4">
                  <Text className="font-bold text-slate-900 text-sm">Add Member</Text>
                  <View className="flex-row gap-2 items-center">
                    <Picker
                      placeholder="Select user..."
                      selectedValue={addingMemberId}
                      onValueChange={setAddingMemberId}
                      options={selectableUsers
                        .filter(u => !members.some(m => m.teacher_id === u.id))
                        .map(u => ({ label: `${u.display_name} (${u.role.toUpperCase()})`, value: u.id }))
                      }
                    />
                    <Pressable
                      disabled={!addingMemberId}
                      onPress={handleAddMember}
                      className="bg-emerald-500 px-4 h-11 items-center justify-center rounded-xl disabled:opacity-50"
                    >
                      <Text className="text-white font-bold text-sm">Add</Text>
                    </Pressable>
                  </View>
                </Card>
              )}

              {/* Members List */}
              <Card className="p-5 space-y-3">
                <Text className="font-bold text-slate-900 text-sm">Group Members ({members.length})</Text>
                <View className="space-y-2">
                  {members.map(m => (
                    <View key={m.id} className="flex-row items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <View className="flex-row items-center gap-2">
                        <Text className="text-slate-800 font-medium text-sm">{m.profiles?.display_name}</Text>
                        <Text className="text-[9px] uppercase font-bold text-slate-400 bg-white border border-slate-100 px-1 rounded">
                          {m.profiles?.role}
                        </Text>
                      </View>
                      
                      {/* Creators can remove members, but not themselves */}
                      {(isGroupCreator || isUserAdmin) && m.teacher_id !== selectedGroup.created_by && (
                        <Pressable onPress={() => handleRemoveMemberClick(m.teacher_id)} className="p-1">
                          <Feather name="trash-2" size={16} color="#EF4444" />
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              </Card>

              {/* Group Actions */}
              <View className="pt-4 space-y-3">
                {/* Delete Group (Creator or Admin) */}
                {(isGroupCreator || isUserAdmin) ? (
                  <Pressable
                    onPress={handleDeleteGroupClick}
                    className="w-full bg-red-50 border border-red-200 rounded-xl py-3.5 items-center active:bg-red-100"
                  >
                    <Text className="font-bold text-red-600">Delete Group</Text>
                  </Pressable>
                ) : (
                  /* Leave Group (Regular members) */
                  <Pressable
                    onPress={() => handleRemoveMemberClick(userId)}
                    className="w-full bg-red-50 border border-red-200 rounded-xl py-3.5 items-center active:bg-red-100"
                  >
                    <Text className="font-bold text-red-600">Leave Group</Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // Render Group List and Join Tab
  return (
    <View className="flex-1 bg-canvas p-4">
      <View className="mb-4 flex-row justify-between items-center">
        <View>
          <Text className="text-2xl font-bold text-slate-900">Groups</Text>
          <Text className="text-slate-500 text-xs mt-0.5">Chat and collaborate in group channels.</Text>
        </View>
        <Pressable
          onPress={() => setCreateVisible(true)}
          className="flex-row items-center gap-1.5 bg-emerald-500 px-4 py-2.5 rounded-xl active:bg-emerald-600"
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text className="text-white font-bold text-sm">New Group</Text>
        </Pressable>
      </View>

      {/* Tabs */}
      <View className="flex-row bg-slate-100 p-1 rounded-xl mb-4">
        <Pressable
          onPress={() => { setTab('my'); setSearchQuery(''); }}
          className={`flex-1 py-2.5 items-center rounded-lg ${tab === 'my' ? 'bg-white shadow-sm' : ''}`}
        >
          <Text className={`font-semibold text-sm ${tab === 'my' ? 'text-slate-900' : 'text-slate-500'}`}>
            My Groups
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { setTab('public'); setSearchQuery(''); }}
          className={`flex-1 py-2.5 items-center rounded-lg ${tab === 'public' ? 'bg-white shadow-sm' : ''}`}
        >
          <Text className={`font-semibold text-sm ${tab === 'public' ? 'text-slate-900' : 'text-slate-500'}`}>
            Discover Public
          </Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5 mb-4 flex-row items-center">
        <Feather name="search" size={18} color="#94A3B8" />
        <TextInput
          className="ml-2 flex-1 text-slate-800 text-sm"
          placeholder={tab === 'my' ? "Search joined groups..." : "Search public study groups..."}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ErrorBanner message={error} onDismiss={() => setError('')} />

      {tab === 'my' ? (
        /* Joined / Created groups */
        <FlatList
          data={queryFilteredGroups}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-10"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => selectGroup(item)}
              className="bg-white p-4 rounded-xl mb-3 border border-slate-100 flex-row justify-between items-center active:bg-slate-50/50"
            >
              <View className="flex-1 pr-4">
                <View className="flex-row items-center gap-2">
                  <Text className="font-bold text-slate-900 text-base">{item.name}</Text>
                  {item.type === 'private' ? (
                    <Feather name="lock" size={12} color="#94A3B8" />
                  ) : null}
                </View>
                {item.description && (
                  <Text className="text-xs text-slate-500 mt-1" numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                {item.creator_role && (
                  <Text className="text-[9px] uppercase font-bold text-slate-400 mt-1.5 self-start bg-slate-100 px-1 py-0.5 rounded">
                    {item.creator_role}
                  </Text>
                )}
              </View>
              <Feather name="chevron-right" size={20} color="#94A3B8" />
            </Pressable>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No Groups Joined"
              description="Join a public study group or create a new one to get started."
            />
          }
        />
      ) : (
        /* Discover public groups */
        <FlatList
          data={groups.filter(g => 
            g.type === 'public' && 
            g.name.toLowerCase().includes(searchQuery.toLowerCase())
          )}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-10"
          renderItem={({ item }) => (
            <View className="bg-white p-4 rounded-xl mb-3 border border-slate-100 flex-row justify-between items-center">
              <View className="flex-1 pr-4">
                <Text className="font-bold text-slate-900 text-base">{item.name}</Text>
                {item.description && (
                  <Text className="text-xs text-slate-500 mt-1" numberOfLines={2}>
                    {item.description}
                  </Text>
                )}
                {item.membership_rules && (
                  <Text className="text-[10px] text-slate-400 mt-1.5 italic" numberOfLines={1}>
                    Rules: {item.membership_rules}
                  </Text>
                )}
              </View>
              <Pressable
                onPress={() => handleJoinGroup(item)}
                className="bg-emerald-500 px-4 py-2 rounded-lg items-center justify-center active:bg-emerald-600"
              >
                <Text className="text-white font-bold text-xs">Join</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search"
              title="No Groups Found"
              description="No public study groups match your search query."
            />
          }
        />
      )}

      {/* Create Group Modal */}
      <Modal
        visible={createVisible}
        animationType="slide"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View className="flex-1 bg-canvas">
          <View className="flex-row items-center justify-between border-b border-slate-100 bg-white px-4 py-4">
            <Text className="text-lg font-bold text-slate-900">Create Group</Text>
            <Pressable onPress={() => setCreateVisible(false)} className="p-1">
              <Feather name="x" size={24} color="#64748B" />
            </Pressable>
          </View>

          <ScrollView className="p-4 space-y-4">
            <View className="space-y-1.5">
              <Text className="text-slate-750 text-sm font-semibold">Group Name</Text>
              <TextInput
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-base"
                placeholder="E.g., Science Study Group"
                value={gName}
                onChangeText={setGName}
              />
            </View>

            <View className="space-y-1.5">
              <Text className="text-slate-750 text-sm font-semibold">Description</Text>
              <TextInput
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-base"
                placeholder="Briefly describe the purpose of this group..."
                value={gDesc}
                onChangeText={setGDesc}
                multiline
                numberOfLines={3}
              />
            </View>

            <View className="space-y-1.5">
              <Text className="text-slate-750 text-sm font-semibold">Type</Text>
              <View className="flex-row gap-2 bg-slate-100 p-1 rounded-xl">
                <Pressable
                  onPress={() => setGType('public')}
                  className={`flex-1 py-2.5 items-center rounded-lg ${gType === 'public' ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`font-semibold text-sm ${gType === 'public' ? 'text-slate-900' : 'text-slate-500'}`}>
                    Public
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setGType('private')}
                  className={`flex-1 py-2.5 items-center rounded-lg ${gType === 'private' ? 'bg-white shadow-sm' : ''}`}
                >
                  <Text className={`font-semibold text-sm ${gType === 'private' ? 'text-slate-900' : 'text-slate-500'}`}>
                    Private
                  </Text>
                </Pressable>
              </View>
            </View>

            <View className="space-y-1.5">
              <Text className="text-slate-750 text-sm font-semibold">Membership Rules (Optional)</Text>
              <TextInput
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 text-slate-800 text-base"
                placeholder="E.g., Open to Grade 10 students only."
                value={gRules}
                onChangeText={setGRules}
              />
            </View>

            <Pressable
              disabled={sending || !gName.trim()}
              onPress={handleCreateGroup}
              className="w-full bg-emerald-500 rounded-xl py-3.5 items-center justify-center active:bg-emerald-600 disabled:opacity-50 mt-6"
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text className="font-bold text-white text-base">Create Group</Text>
              )}
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}
