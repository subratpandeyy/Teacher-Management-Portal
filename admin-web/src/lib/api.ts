import { supabase } from './supabase';

/** Admin queries always scope to the selected teacher to avoid accidental cross-teacher UI leaks. */
export async function assertAdmin() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.user.id)
    .single();

  if (error || profile?.role !== 'admin') {
    throw new Error('Admin access required');
  }
  return user.user.id;
}

export async function listTeachers() {
  await assertAdmin();
  const { data, error } = await supabase.rpc('admin_list_teachers');
  return { data, error };
}

export async function fetchTeacherInbox(teacherId: string) {
  await assertAdmin();
  return supabase
    .from('inbox_messages')
    .select('id, teacher_id, subject, body, is_read, created_at')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
}

export async function sendInboxToTeacher(
  teacherId: string,
  subject: string,
  body: string
) {
  await assertAdmin();
  return supabase.from('inbox_messages').insert({
    teacher_id: teacherId,
    subject,
    body,
  });
}

export async function fetchTeacherDocuments(teacherId: string) {
  await assertAdmin();
  return supabase
    .from('documents')
    .select('id, teacher_id, title, storage_path, created_at')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
}

export async function getTeacherConversation(teacherId: string) {
  await assertAdmin();
  return supabase
    .from('conversations')
    .select('id, teacher_id, created_at')
    .eq('teacher_id', teacherId)
    .single();
}

export async function fetchConversationMessages(conversationId: string, teacherId: string) {
  await assertAdmin();
  const conv = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('teacher_id', teacherId)
    .single();
  if (conv.error) return { data: null, error: conv.error };

  return supabase
    .from('chat_messages')
    .select('id, conversation_id, sender_id, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
}

export async function sendAdminChatMessage(
  conversationId: string,
  adminId: string,
  teacherId: string,
  body: string
) {
  await assertAdmin();
  const conv = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('teacher_id', teacherId)
    .single();
  if (conv.error) return { error: conv.error.message };

  const { error } = await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: adminId,
    body,
  });
  return { error: error?.message ?? null };
}

export async function getSignedUrl(storagePath: string, teacherId: string) {
  await assertAdmin();
  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('storage_path', storagePath)
    .eq('teacher_id', teacherId)
    .single();

  if (docErr || !doc) {
    return { data: null, error: docErr ?? new Error('Document not found for teacher') };
  }

  return supabase.storage.from('teacher-documents').createSignedUrl(storagePath, 3600);
}
