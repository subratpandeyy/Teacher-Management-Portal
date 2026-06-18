import { Feather } from '@expo/vector-icons';
import { useEffect, useState, useCallback } from 'react';
import { ScrollView, Text, View, Pressable, TextInput, FlatList, ActivityIndicator, Alert, Modal, Platform } from 'react-native';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Picker } from '../../components/ui/Picker';

export default function CoordinatorTasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal & Form state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [formAssigneeId, setFormAssigneeId] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formStatus, setFormStatus] = useState<'pending' | 'in_progress' | 'completed' | 'overdue'>('pending');

  // Assignees list (teachers and students in scope)
  const [scopeAssignees, setScopeAssignees] = useState<any[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);

  const fetchScopeAssignees = useCallback(async () => {
    if (!profile) return;
    setLoadingAssignees(true);
    try {
      // Get all coordinator assignments to find latest active coordinator for each teacher/student
      const { data: allAssigns } = await supabase
        .from('coordinator_assignments')
        .select('*')
        .order('created_at', { ascending: true });

      const latestUserMap = new Map();
      for (const a of allAssigns || []) {
        if (a.teacher_id) latestUserMap.set(a.teacher_id, a.coordinator_id);
        if (a.student_id) latestUserMap.set(a.student_id, a.coordinator_id);
      }

      const inScopeUserIds: string[] = [];
      latestUserMap.forEach((coordId, userId) => {
        if (coordId === profile.id) {
          inScopeUserIds.push(userId);
        }
      });

      if (inScopeUserIds.length === 0) {
        setScopeAssignees([]);
        return;
      }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, role')
        .in('id', inScopeUserIds)
        .is('deleted_at', null)
        .order('display_name');

      setScopeAssignees(profiles || []);
      if (profiles && profiles.length > 0) {
        setFormAssigneeId(profiles[0].id);
      }
    } catch (err) {
      console.error('Error fetching assignees:', err);
    } finally {
      setLoadingAssignees(false);
    }
  }, [profile]);

  const fetchTasks = useCallback(async () => {
    if (!profile) return;
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          assignee:profiles!tasks_assigned_to_fkey(id, display_name, role)
        `)
        .eq('assigned_by', profile.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (err) {
      console.error('Error fetching tasks:', err);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchTasks();
    fetchScopeAssignees();
  }, [fetchTasks, fetchScopeAssignees]);

  const handleOpenCreateModal = () => {
    setEditingTask(null);
    setFormTitle('');
    setFormDesc('');
    setFormPriority('medium');
    setFormDueDate(new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]); // 2 days from now
    setFormStatus('pending');
    if (scopeAssignees.length > 0) {
      setFormAssigneeId(scopeAssignees[0].id);
    } else {
      setFormAssigneeId('');
    }
    setModalVisible(true);
  };

  const handleOpenEditModal = (task: any) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDesc(task.description || '');
    setFormPriority(task.priority);
    setFormAssigneeId(task.assigned_to);
    setFormStatus(task.status);
    if (task.due_date) {
      setFormDueDate(task.due_date.split('T')[0]);
    } else {
      setFormDueDate('');
    }
    setModalVisible(true);
  };

  const handleSaveTask = async () => {
    if (!formTitle.trim()) {
      Alert.alert('Validation Error', 'Task title is required');
      return;
    }
    if (!formAssigneeId) {
      Alert.alert('Validation Error', 'Please select an assignee from your scope');
      return;
    }

    const payload = {
      title: formTitle,
      description: formDesc || null,
      assigned_to: formAssigneeId,
      assigned_by: profile!.id,
      priority: formPriority,
      status: formStatus,
      due_date: formDueDate ? new Date(formDueDate).toISOString() : null,
    };

    try {
      if (editingTask) {
        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', editingTask.id);
        if (error) throw error;
        Alert.alert('Success', 'Task updated successfully');
      } else {
        const { error } = await supabase
          .from('tasks')
          .insert(payload);
        if (error) throw error;
        Alert.alert('Success', 'Task created successfully');
      }
      setModalVisible(false);
      fetchTasks();
    } catch (err: any) {
      Alert.alert('Error saving task', err?.message || 'Something went wrong');
    }
  };

  const handleDeleteTask = (taskId: string) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to permanently delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('tasks')
                .delete()
                .eq('id', taskId);
              if (error) throw error;
              fetchTasks();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete task');
            }
          }
        }
      ]
    );
  };

  const handleToggleComplete = async (task: any) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: nextStatus })
        .eq('id', task.id);
      if (error) throw error;
      fetchTasks();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update task status');
    }
  };

  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title?.toLowerCase().includes(search.toLowerCase()) || 
                          t.description?.toLowerCase().includes(search.toLowerCase()) ||
                          t.assignee?.display_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' ? true : t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getPriorityColor = (p: string) => {
    switch (p) {
      case 'high': return { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-600' };
      case 'medium': return { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-600' };
      default: return { bg: 'bg-slate-50 border border-slate-200', text: 'text-slate-600' };
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'completed': return { bg: 'bg-green-50 border border-green-200', text: 'text-blue-600' };
      case 'in_progress': return { bg: 'bg-blue-50 border border-blue-200', text: 'text-blue-600' };
      case 'overdue': return { bg: 'bg-rose-100 border border-rose-300', text: 'text-rose-700' };
      default: return { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-600' };
    }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator size="large" color="#10B981" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas p-4">
      {/* Header */}
      <View className="flex-row justify-between items-center mb-4">
        <View>
          <Text className="text-2xl font-bold text-slate-900">Task Management</Text>
          <Text className="text-slate-500 text-sm">Assign and monitor work</Text>
        </View>
        <Pressable
          onPress={handleOpenCreateModal}
          className="bg-emerald-500 flex-row items-center gap-1.5 px-4 py-2.5 rounded-xl shadow-sm"
        >
          <Feather name="plus" size={18} color="white" />
          <Text className="text-white font-bold text-sm">Create Task</Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View className="flex-row items-center bg-white border border-slate-200 rounded-2xl px-3 py-2.5 mb-4">
        <Feather name="search" size={20} color="#94A3B8" className="mr-2" />
        <TextInput
          placeholder="Search tasks by title, desc or assignee..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#94A3B8"
          className="flex-1 text-slate-800 text-sm ml-2"
          style={{ paddingVertical: Platform.OS === 'ios' ? 4 : 0 }}
        />
      </View>

      {/* Status Filter Badges */}
      <View className="flex-row gap-2 mb-4">
        {['all', 'pending', 'in_progress', 'completed'].map(status => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter(status)}
            className={`px-3 py-1.5 rounded-full ${statusFilter === status ? 'bg-emerald-500' : 'bg-slate-100'}`}
          >
            <Text className={`text-xs font-semibold capitalize ${statusFilter === status ? 'text-white' : 'text-slate-600'}`}>
              {status === 'all' ? 'All Tasks' : status.replace('_', ' ')}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Tasks List */}
      <FlatList
        data={filteredTasks}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          const pStyle = getPriorityColor(item.priority);
          const sStyle = getStatusColor(item.status);
          return (
            <Card className="mb-3 p-4">
              <View className="flex-row justify-between items-start">
                <View className="flex-1 mr-2">
                  <Text className="text-base font-bold text-slate-900">{item.title}</Text>
                  {item.description && (
                    <Text className="text-slate-500 text-sm mt-1" numberOfLines={2}>
                      {item.description}
                    </Text>
                  )}
                </View>
                <Pressable onPress={() => handleToggleComplete(item)} className="p-1">
                  <Feather
                    name={item.status === 'completed' ? 'check-circle' : 'circle'}
                    size={22}
                    color={item.status === 'completed' ? '#10B981' : '#CBD5E1'}
                  />
                </Pressable>
              </View>

              {/* Detail row */}
              <View className="flex-row flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                <View className={`px-2.5 py-0.5 rounded-md ${pStyle.bg}`}>
                  <Text className={`text-xs font-bold capitalize ${pStyle.text}`}>{item.priority} priority</Text>
                </View>
                <View className={`px-2.5 py-0.5 rounded-md ${sStyle.bg}`}>
                  <Text className={`text-xs font-bold capitalize ${sStyle.text}`}>{item.status.replace('_', ' ')}</Text>
                </View>
                {item.due_date && (
                  <View className="flex-row items-center bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                    <Feather name="calendar" size={12} color="#64748B" />
                    <Text className="text-slate-600 text-xs font-semibold ml-1">
                      Due: {item.due_date.split('T')[0]}
                    </Text>
                  </View>
                )}
              </View>

              {/* Assignee & Actions row */}
              <View className="flex-row justify-between items-center mt-3 pt-3 border-t border-slate-100/60">
                <View className="flex-row items-center gap-1.5">
                  <View className="h-6 w-6 rounded-full bg-blue-50 items-center justify-center">
                    <Text className="text-blue-600 font-bold text-xs">
                      {item.assignee?.display_name?.charAt(0).toUpperCase() || '?'}
                    </Text>
                  </View>
                  <Text className="text-slate-700 text-xs font-medium">
                    {item.assignee?.display_name || 'Unassigned'} ({item.assignee?.role || 'user'})
                  </Text>
                </View>

                {/* Edit / Delete Buttons */}
                <View className="flex-row gap-3">
                  <Pressable onPress={() => handleOpenEditModal(item)} className="p-1">
                    <Feather name="edit-2" size={16} color="#64748B" />
                  </Pressable>
                  <Pressable onPress={() => handleDeleteTask(item.id)} className="p-1">
                    <Feather name="trash-2" size={16} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            </Card>
          );
        }}
        ListEmptyComponent={
          <View className="py-16 items-center justify-center">
            <Feather name="check-square" size={48} color="#CBD5E1" />
            <Text className="text-slate-400 text-sm mt-3 font-medium">No tasks found</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      />

      {/* Task Creation & Edit Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white rounded-t-3xl p-6 min-h-[60%] space-y-4">
            <View className="flex-row justify-between items-center mb-2">
              <Text className="text-lg font-bold text-slate-900">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)} className="p-1">
                <Feather name="x" size={24} color="#64748B" />
              </Pressable>
            </View>

            <ScrollView className="space-y-4 max-h-[80%]">
              {/* Task Title */}
              <View>
                <Text className="text-slate-700 text-xs font-bold mb-1.5">Task Title</Text>
                <TextInput
                  value={formTitle}
                  onChangeText={setFormTitle}
                  placeholder="E.g., Complete lesson 3 feedback"
                  placeholderTextColor="#94A3B8"
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm"
                />
              </View>

              {/* Task Description */}
              <View>
                <Text className="text-slate-700 text-xs font-bold mb-1.5">Description (Optional)</Text>
                <TextInput
                  value={formDesc}
                  onChangeText={setFormDesc}
                  placeholder="Enter task details..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm min-h-[80]"
                  style={{ textAlignVertical: 'top' }}
                />
              </View>

              {/* Assignee Dropdown */}
              <View>
                <Text className="text-slate-700 text-xs font-bold mb-1.5">Assign To (Scope Users)</Text>
                {loadingAssignees ? (
                  <ActivityIndicator size="small" color="#10B981" />
                ) : scopeAssignees.length === 0 ? (
                  <Text className="text-xs text-rose-500 italic">No teachers or students in your scope to assign tasks to.</Text>
                ) : (
                  <Picker
                    options={scopeAssignees.map(u => ({ label: `${u.display_name} (${u.role})`, value: u.id }))}
                    selectedValue={formAssigneeId}
                    onValueChange={setFormAssigneeId}
                    placeholder="Choose assignee"
                  />
                )}
              </View>

              {/* Priority Select */}
              <View>
                <Text className="text-slate-700 text-xs font-bold mb-1.5">Priority</Text>
                <View className="flex-row gap-2">
                  {(['low', 'medium', 'high'] as const).map(p => (
                    <Pressable
                      key={p}
                      onPress={() => setFormPriority(p)}
                      className={`flex-1 py-2.5 rounded-xl border items-center ${
                        formPriority === p
                          ? p === 'high'
                            ? 'bg-rose-500 border-rose-500'
                            : p === 'medium'
                            ? 'bg-amber-500 border-amber-500'
                            : 'bg-slate-500 border-slate-500'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <Text className={`font-semibold capitalize text-sm ${formPriority === p ? 'text-white' : 'text-slate-600'}`}>
                        {p}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Status Select (Only visible when editing) */}
              {editingTask && (
                <View>
                  <Text className="text-slate-700 text-xs font-bold mb-1.5">Status</Text>
                  <Picker
                    options={[
                      { label: 'Pending', value: 'pending' },
                      { label: 'In Progress', value: 'in_progress' },
                      { label: 'Completed', value: 'completed' },
                      { label: 'Overdue', value: 'overdue' }
                    ]}
                    selectedValue={formStatus}
                    onValueChange={(val: any) => setFormStatus(val)}
                    placeholder="Choose status"
                  />
                </View>
              )}

              {/* Due Date (Plain YYYY-MM-DD input for simplicity and reliability) */}
              <View>
                <Text className="text-slate-700 text-xs font-bold mb-1.5">Due Date (YYYY-MM-DD)</Text>
                <TextInput
                  value={formDueDate}
                  onChangeText={setFormDueDate}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#94A3B8"
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-800 text-sm"
                />
              </View>
            </ScrollView>

            {/* Save Button */}
            <Pressable
              onPress={handleSaveTask}
              disabled={scopeAssignees.length === 0}
              className={`py-3.5 rounded-xl items-center shadow-sm ${scopeAssignees.length === 0 ? 'bg-slate-300' : 'bg-emerald-500'}`}
            >
              <Text className="text-white font-bold text-base">
                {editingTask ? 'Save Changes' : 'Create Task'}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
