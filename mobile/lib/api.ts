import { supabase } from './supabase';
import { removeStorageObject, uploadFileToStorage } from './storageUpload';

/** All teacher-scoped queries include teacher_id = auth user id (defense in depth with RLS). */
export function teacherScope(teacherId: string) {
  return { teacherId };
}

export async function fetchInbox(teacherId: string) {
  return supabase
    .from('inbox_messages')
    .select('id, teacher_id, subject, body, is_read, created_at')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
}

export async function markInboxRead(teacherId: string, messageId: string) {
  return supabase
    .from('inbox_messages')
    .update({ is_read: true })
    .eq('id', messageId)
    .eq('teacher_id', teacherId);
}

export async function fetchDocuments(teacherId: string) {
  return supabase
    .from('documents')
    .select('id, teacher_id, title, storage_path, mime_type, created_at')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
}

export async function getSignedDocumentUrl(storagePath: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from('teacher-documents')
    .createSignedUrl(storagePath, expiresIn);
  return { url: data?.signedUrl ?? null, error };
}

export async function uploadDocument(
  teacherId: string,
  file: { uri: string; name: string; mimeType?: string; size?: number }
) {
  const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `${teacherId}/${docId}/${file.name}`;

  const uploadResult = await uploadFileToStorage(storagePath, {
    uri: file.uri,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
  });
  if (!uploadResult.ok) {
    return { error: uploadResult.error };
  }

  const { error: dbError } = await supabase.from('documents').insert({
    teacher_id: teacherId,
    title: file.name,
    storage_path: storagePath,
    mime_type: file.mimeType ?? null,
  });

  if (dbError) {
    await removeStorageObject(storagePath);
    return { error: dbError.message };
  }

  return { error: null };
}

export async function getOrCreateConversation(teacherId: string) {
  const existing = await supabase
    .from('conversations')
    .select('id, teacher_id, created_at')
    .eq('teacher_id', teacherId)
    .maybeSingle();

  if (existing.data) return { conversation: existing.data, error: existing.error };
  if (existing.error) return { conversation: null, error: existing.error };

  return {
    conversation: null,
    error: { message: 'Conversation not found. Re-run migrations or contact support.' },
  };
}

export async function fetchChatMessages(conversationId: string, teacherId: string) {
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

export async function sendChatMessage(
  conversationId: string,
  senderId: string,
  body: string,
  teacherId: string
) {
  const conv = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('teacher_id', teacherId)
    .single();

  if (conv.error) return { error: conv.error.message };

  const { error } = await supabase.from('chat_messages').insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body,
  });

  return { error: error?.message ?? null };
}
