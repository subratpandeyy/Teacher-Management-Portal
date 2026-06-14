import { supabase } from './supabase';
import { generateUuid } from './generateUuid';
import {
  createSignedStorageUrl,
  removeStorageFile,
  sanitizeStorageFileName,
  STORAGE_BUCKETS,
  uploadFile,
  type StorageBucket,
} from './storageService';
import type { PickedFile } from './documentPicker';
import { UPLOAD_LOG } from './uploadLog';
import { openDocumentWithLinking } from './openDocument';
import type {
  TeacherBroadcast,
  BroadcastFeedback,
  AssignedDocument,
  ChatMessage,
  BroadcastAttachment,
} from './types';

// ─── Broadcasts ───────────────────────────────────────────────────────────────
export async function fetchBroadcasts(_teacherId: string) {
  const { data, error } = await supabase.rpc('teacher_my_broadcasts');
  if (error) return { data: [] as TeacherBroadcast[], error };

  const items: TeacherBroadcast[] = (data ?? []).map((row: Record<string, unknown>) => {
    const rawAttachments = row.attachments;
    let attachments: BroadcastAttachment[] = [];
    if (Array.isArray(rawAttachments)) {
      attachments = rawAttachments.map((a: Record<string, unknown>) => ({
        id: String(a.id),
        storage_path: String(a.storage_path),
        file_name: String(a.file_name),
        mime_type: (a.mime_type as string | null) ?? null,
      }));
    }

    return {
      recipient_id: String(row.recipient_id),
      broadcast_id: String(row.broadcast_id),
      title: String(row.title),
      message: String(row.message ?? row.body),
      published_at: String(row.published_at),
      attachment_url: (row.attachment_url as string | null) ?? null,
      attachment_name: (row.attachment_name as string | null) ?? null,
      attachments,
      read_at: (row.read_at as string | null) ?? null,
      created_at: String(row.created_at),
    };
  });

  return { data: items, error: null };
}

export async function markBroadcastRead(recipientId: string, _teacherId: string) {
  return supabase.rpc('mark_broadcast_read', { p_recipient_id: recipientId });
}

export async function submitBroadcastFeedback(
  teacherId: string,
  broadcastId: string,
  feedbackText: string
) {
  return supabase.from('broadcast_feedback').upsert(
    {
      broadcast_id: broadcastId,
      teacher_id: teacherId,
      feedback_text: feedbackText,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'broadcast_id,teacher_id' }
  );
}

export async function fetchMyBroadcastFeedback(teacherId: string, broadcastId: string) {
  return supabase
    .from('broadcast_feedback')
    .select('*')
    .eq('teacher_id', teacherId)
    .eq('broadcast_id', broadcastId)
    .maybeSingle();
}

export async function deleteMyBroadcastFeedback(
  teacherId: string,
  broadcastId: string,
  feedbackId: string
) {
  return supabase
    .from('broadcast_feedback')
    .delete()
    .eq('id', feedbackId)
    .eq('teacher_id', teacherId)
    .eq('broadcast_id', broadcastId);
}

// ─── Documents (view only) ────────────────────────────────────────────────────
export async function fetchDocumentsFromAdmin(_teacherId: string) {
  return supabase.rpc('teacher_assigned_documents');
}

export async function openAssignedDocument(doc: {
  storage_path: string;
  storage_bucket?: string | null;
  mime_type?: string | null;
}) {
  const result = await openDocumentWithLinking(doc);
  return { url: result.ok ? result.signedUrl : null, error: result.ok ? null : { message: result.error } };
}

export async function fetchMyUploadsToAdmin(teacherId: string) {
  return supabase
    .from('documents')
    .select('id, title, file_name, storage_path, storage_bucket, mime_type, created_at')
    .eq('teacher_id', teacherId)
    .eq('direction', 'teacher_to_admin')
    .order('created_at', { ascending: false });
}

export async function uploadTeacherDocumentToAdmin(teacherId: string, picked: PickedFile) {
  const docId = generateUuid();
  const safeName = sanitizeStorageFileName(picked.name);
  const storagePath = `${teacherId}/inbound/${docId}/${safeName}`;

  const uploaded = await uploadFile({
    bucket: STORAGE_BUCKETS.documents,
    path: storagePath,
    file: picked.file,
    fileName: picked.name,
    contentType: picked.mimeType,
  });

  if (!uploaded.ok) {
    console.error(UPLOAD_LOG, 'upload failed', uploaded.error);
    return { error: uploaded.error };
  }

  const { error: insertErr } = await supabase.from('documents').insert({
    id: docId,
    title: picked.name,
    file_name: picked.name,
    storage_path: storagePath,
    storage_bucket: STORAGE_BUCKETS.documents,
    mime_type: picked.mimeType ?? null,
    teacher_id: teacherId,
    uploaded_by: teacherId,
    direction: 'teacher_to_admin',
  });

  if (insertErr) {
    console.error(UPLOAD_LOG, 'upload failed', insertErr.message);
    await removeStorageFile(STORAGE_BUCKETS.documents, storagePath);
    return { error: insertErr.message };
  }

  console.log(UPLOAD_LOG, 'database insert success', docId);
  return { error: null, documentId: docId, signedUrl: uploaded.signedUrl };
}

export async function deleteTeacherDocument(teacherId: string, documentId: string) {
  const { data: row, error: fetchErr } = await supabase
    .from('documents')
    .select('storage_path, storage_bucket')
    .eq('id', documentId)
    .eq('teacher_id', teacherId)
    .eq('direction', 'teacher_to_admin')
    .single();

  if (fetchErr || !row) {
    return { error: fetchErr?.message ?? 'Document not found' };
  }

  const bucket = (row.storage_bucket as StorageBucket) ?? STORAGE_BUCKETS.documents;
  await removeStorageFile(bucket, row.storage_path);

  const { error: delErr } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId)
    .eq('teacher_id', teacherId);

  return { error: delErr?.message ?? null };
}

export async function getSignedBroadcastAttachmentUrl(storagePath: string, expiresIn = 3600) {
  const { data, error } = await createSignedStorageUrl(
    storagePath,
    STORAGE_BUCKETS.attachments,
    expiresIn
  );
  return { url: data?.signedUrl ?? null, error };
}

// ─── Groups ───────────────────────────────────────────────────────────────────
export async function fetchGroups() {
  return supabase
    .from('groups')
    .select('*')
    .order('created_at', { ascending: false });
}

export async function createGroup(name: string, description: string | null, type = 'public', membershipRules = '', userId: string) {
  return supabase
    .from('groups')
    .insert({
      name,
      description,
      type,
      membership_rules: membershipRules,
      created_by: userId
    })
    .select()
    .single();
}

export async function updateGroup(id: string, name: string, description: string | null, type?: string, membershipRules?: string) {
  return supabase
    .from('groups')
    .update({ name, description, type, membership_rules: membershipRules })
    .eq('id', id);
}

export async function deleteGroup(id: string) {
  return supabase
    .from('groups')
    .delete()
    .eq('id', id);
}

export async function fetchGroupMembers(groupId: string) {
  return supabase
    .from('group_members')
    .select('id, group_id, teacher_id, profiles:teacher_id(display_name, role)')
    .eq('group_id', groupId);
}

export async function addGroupMember(groupId: string, userId: string) {
  return supabase
    .from('group_members')
    .insert({ group_id: groupId, teacher_id: userId });
}

export async function removeGroupMember(groupId: string, userId: string) {
  return supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('teacher_id', userId);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
export async function getOrCreateConversation(teacherId: string) {
  const { data: convId, error: rpcErr } = await supabase.rpc('ensure_teacher_conversation', {
    p_teacher_id: teacherId,
  });

  if (rpcErr) return { conversation: null, error: rpcErr };

  const { data, error } = await supabase
    .from('conversations')
    .select('id, teacher_id, created_at')
    .eq('id', convId as string)
    .single();

  return { conversation: data, error };
}

export async function fetchChatMessages(conversationId: string, userId: string) {
  const conv = await supabase
    .from('conversations')
    .select('id, teacher_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (conv.error || !conv.data) {
    return { data: null, error: conv.error ?? new Error('Conversation not found') };
  }

  const isOwner = conv.data.teacher_id === userId;
  if (!isOwner) {
    const participant = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .eq('profile_id', userId)
      .maybeSingle();

    if (participant.error || !participant.data) {
      return { data: null, error: participant.error ?? new Error('Not a participant') };
    }
  }

  return supabase
    .from('chat_messages')
    .select(
      `id, conversation_id, sender_id, receiver_id, body, attachment_url, attachment_name, attachment_type, created_at, updated_at, deleted_at,
      sender:profiles!chat_messages_sender_id_fkey(display_name, role)`
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
}

export async function uploadChatAttachment(
  conversationId: string,
  teacherId: string,
  picked: PickedFile
) {
  const conv = await supabase
    .from('conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('teacher_id', teacherId)
    .single();

  if (conv.error) return { error: conv.error.message, path: null as string | null, name: null as string | null };

  const safeName = sanitizeStorageFileName(picked.name);
  const segment = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `${conversationId}/${segment}/${safeName}`;

  const uploaded = await uploadFile({
    bucket: STORAGE_BUCKETS.chatFiles,
    path: storagePath,
    file: picked.file,
    fileName: picked.name,
    contentType: picked.mimeType,
  });

  if (!uploaded.ok) {
    return { error: uploaded.error, path: null, name: null, mimeType: null };
  }

  return {
    error: null,
    path: uploaded.storagePath,
    name: picked.name,
    mimeType: picked.mimeType ?? null,
  };
}

export async function sendChatMessage(
  conversationId: string,
  senderId: string,
  body: string,
  teacherId: string,
  attachment?: { url: string; name: string; type?: string | null } | null
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
    attachment_url: attachment?.url ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_type: attachment?.type ?? null,
  });

  return { error: error?.message ?? null };
}

export async function updateChatMessage(messageId: string, teacherId: string, body: string) {
  return supabase
    .from('chat_messages')
    .update({ body })
    .eq('id', messageId)
    .eq('sender_id', teacherId)
    .is('deleted_at', null);
}

export async function softDeleteChatMessage(messageId: string, teacherId: string) {
  return supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString(), body: 'Message deleted' })
    .eq('id', messageId)
    .eq('sender_id', teacherId);
}

export async function getChatAttachmentUrl(storagePath: string) {
  const { data, error } = await createSignedStorageUrl(
    storagePath,
    STORAGE_BUCKETS.chatFiles,
    3600
  );
  return { url: data?.signedUrl ?? null, error };
}

// ─── Availability ─────────────────────────────────────────────────────────────
export type AvailabilityEntry = {
  id: string;
  kind: 'date_range' | 'recurring_weekly';
  start_date: string | null;
  end_date: string | null;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  notes: string | null;
};

export async function fetchAvailability(teacherId: string) {
  return supabase
    .from('teacher_availability')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
}

export async function addAvailability(
  teacherId: string,
  entry: Omit<AvailabilityEntry, 'id'>
) {
  return supabase.from('teacher_availability').insert({
    teacher_id: teacherId,
    ...entry,
  });
}

export async function deleteAvailability(teacherId: string, id: string) {
  return supabase
    .from('teacher_availability')
    .delete()
    .eq('id', id)
    .eq('teacher_id', teacherId);
}

export type { TeacherBroadcast, BroadcastFeedback, AssignedDocument, ChatMessage };
