import { supabase } from './supabase';
import {
  createSignedStorageUrl,
  removeStorageFile,
  sanitizeStorageFileName,
  STORAGE_BUCKETS,
  uploadFile,
} from './storageUpload';
import type {
  BroadcastAttachment,
  BroadcastFeedback,
  BroadcastTargetType,
  DocumentTargetType,
  Group,
  TeacherBroadcast,
} from '../../../shared/types';

export async function assertAdmin() {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error('Not authenticated');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.user.id)
    .single();
  if (profile?.role !== 'admin') throw new Error('Admin access required');
  return user.user.id;
}

export async function listTeachers() {
  await assertAdmin();
  return supabase.rpc('admin_list_teachers');
}

// ─── Groups ───────────────────────────────────────────────────────────────────
export async function fetchGroups() {
  await assertAdmin();
  return supabase.from('groups').select('*').order('created_at', { ascending: false });
}

export async function createGroup(name: string, description: string | null) {
  const adminId = await assertAdmin();
  return supabase
    .from('groups')
    .insert({ name, description, created_by: adminId })
    .select()
    .single();
}

export async function updateGroup(id: string, name: string, description: string | null) {
  await assertAdmin();
  return supabase.from('groups').update({ name, description }).eq('id', id);
}

export async function deleteGroup(id: string) {
  await assertAdmin();
  return supabase.from('groups').delete().eq('id', id);
}

export async function fetchGroupMembers(groupId: string) {
  await assertAdmin();
  return supabase
    .from('group_members')
    .select('id, teacher_id, profiles:teacher_id(display_name)')
    .eq('group_id', groupId);
}

export async function addGroupMember(groupId: string, teacherId: string) {
  await assertAdmin();
  return supabase.from('group_members').insert({ group_id: groupId, teacher_id: teacherId });
}

export async function removeGroupMember(groupId: string, teacherId: string) {
  await assertAdmin();
  return supabase.from('group_members').delete().eq('group_id', groupId).eq('teacher_id', teacherId);
}

// ─── Broadcasts ───────────────────────────────────────────────────────────────
function resolveBroadcastRpcTarget(opts: {
  targetType: BroadcastTargetType;
  targetId?: string | null;
  teacherIds?: string[];
  groupIds?: string[];
}) {
  const teacherIds = opts.teacherIds?.length ? opts.teacherIds : null;
  const groupIds = opts.groupIds?.length ? opts.groupIds : null;

  let targetType = opts.targetType;
  let targetId: string | null = null;

  if (targetType === 'teacher') {
    if (teacherIds?.length === 1) {
      targetId = teacherIds[0];
      return { targetType: 'teacher' as const, targetId, teacherIds, groupIds: null };
    }
    return { targetType: 'teacher' as const, targetId: null, teacherIds, groupIds: null };
  }

  if (targetType === 'group') {
    targetId = opts.targetId ?? null;
    return { targetType: 'group' as const, targetId, teacherIds: null, groupIds: null };
  }

  if (targetType === 'groups') {
    return { targetType: 'group' as const, targetId: null, teacherIds: null, groupIds };
  }

  return { targetType: 'all' as const, targetId: null, teacherIds: null, groupIds: null };
}

export async function createBroadcast(opts: {
  title: string;
  message: string;
  targetType: BroadcastTargetType;
  targetId?: string | null;
  teacherIds?: string[];
  groupIds?: string[];
  broadcastId?: string;
}) {
  await assertAdmin();
  const t = resolveBroadcastRpcTarget(opts);
  const broadcastId = opts.broadcastId ?? crypto.randomUUID();

  const { data, error } = await supabase.rpc('admin_create_broadcast', {
    p_title: opts.title,
    p_message: opts.message,
    p_target_type: t.targetType,
    p_target_id: t.targetId,
    p_teacher_ids: t.teacherIds,
    p_group_ids: t.groupIds,
    p_broadcast_id: broadcastId,
  });

  if (error) return { error: error.message, broadcastId: null };
  return { error: null, broadcastId: (data as string) ?? broadcastId };
}

/** Step 1–2: upload file to attachments bucket (path = {broadcastId}/{filename}). */
export async function uploadBroadcastAttachmentFile(broadcastId: string, file: File) {
  await assertAdmin();
  const safeName = sanitizeStorageFileName(file.name);
  const storagePath = `${broadcastId}/${safeName}`;

  const uploaded = await uploadFile({
    bucket: STORAGE_BUCKETS.attachments,
    path: storagePath,
    file,
    contentType: file.type || undefined,
  });

  if (!uploaded.ok) {
    return { error: uploaded.error, storagePath: null as string | null, signedUrl: null as string | null };
  }

  return { error: null, storagePath: uploaded.storagePath, signedUrl: uploaded.signedUrl };
}

/** Step 4: link uploaded object to broadcast_attachments. */
export async function registerBroadcastAttachmentMetadata(
  broadcastId: string,
  storagePath: string,
  file: File
) {
  await assertAdmin();
  const { error: regErr } = await supabase.rpc('register_broadcast_attachment', {
    p_broadcast_id: broadcastId,
    p_storage_path: storagePath,
    p_file_name: file.name,
    p_mime_type: file.type || null,
    p_file_size: file.size ?? null,
    p_storage_bucket: STORAGE_BUCKETS.attachments,
  });

  if (regErr) return { error: regErr.message };
  return { error: null };
}

/**
 * Full broadcast + attachment flow:
 * 1 upload → 2 signed URL → 3 create broadcast → 4 register metadata.
 * Rolls back storage if a later step fails.
 */
export async function sendBroadcastWithOptionalAttachment(opts: {
  title: string;
  message: string;
  targetType: BroadcastTargetType;
  targetId?: string | null;
  teacherIds?: string[];
  groupIds?: string[];
  attachment?: File | null;
}) {
  const broadcastId = crypto.randomUUID();
  let uploadedPath: string | null = null;

  if (opts.attachment) {
    const up = await uploadBroadcastAttachmentFile(broadcastId, opts.attachment);
    if (up.error) {
      return { error: `Attachment upload failed: ${up.error}`, broadcastId: null };
    }
    uploadedPath = up.storagePath;
  }

  const created = await createBroadcast({
    title: opts.title,
    message: opts.message,
    targetType: opts.targetType,
    targetId: opts.targetId,
    teacherIds: opts.teacherIds,
    groupIds: opts.groupIds,
    broadcastId,
  });

  if (created.error || !created.broadcastId) {
    if (uploadedPath) {
      await removeStorageFile(STORAGE_BUCKETS.attachments, uploadedPath);
    }
    return { error: created.error ?? 'Failed to create broadcast', broadcastId: null };
  }

  if (opts.attachment && uploadedPath) {
    const reg = await registerBroadcastAttachmentMetadata(
      created.broadcastId,
      uploadedPath,
      opts.attachment
    );
    if (reg.error) {
      await removeStorageFile(STORAGE_BUCKETS.attachments, uploadedPath);
      return {
        error: `Broadcast created but attachment metadata failed: ${reg.error}`,
        broadcastId: created.broadcastId,
      };
    }
  }

  return { error: null, broadcastId: created.broadcastId };
}

/** @deprecated Use sendBroadcastWithOptionalAttachment */
export async function attachFileToBroadcast(broadcastId: string, file: File) {
  const up = await uploadBroadcastAttachmentFile(broadcastId, file);
  if (up.error) return { error: up.error };
  return registerBroadcastAttachmentMetadata(broadcastId, up.storagePath!, file);
}

export async function fetchBroadcastAttachments(broadcastId: string) {
  await assertAdmin();
  return supabase
    .from('broadcast_attachments')
    .select('*')
    .eq('broadcast_id', broadcastId)
    .order('created_at', { ascending: true });
}

export async function fetchBroadcasts() {
  await assertAdmin();
  return supabase
    .from('broadcasts')
    .select('id, title, message, body, target_type, target_id, published_at, attachment_url, attachment_name, created_at')
    .order('created_at', { ascending: false });
}

export async function fetchBroadcastReadReceipts(broadcastId: string) {
  await assertAdmin();
  return supabase
    .from('broadcast_recipients')
    .select('id, read_at, teacher_id, profiles:teacher_id(display_name)')
    .eq('broadcast_id', broadcastId);
}

export async function fetchBroadcastFeedback(broadcastId: string) {
  await assertAdmin();
  return supabase
    .from('broadcast_feedback')
    .select('id, broadcast_id, teacher_id, feedback_text, created_at, updated_at, profiles:teacher_id(display_name)')
    .eq('broadcast_id', broadcastId)
    .order('created_at', { ascending: false });
}

// ─── Documents ────────────────────────────────────────────────────────────────
function resolveDocumentRpcTarget(opts: {
  targetType: DocumentTargetType;
  targetId?: string | null;
  teacherIds?: string[];
  groupIds?: string[];
}) {
  if (opts.targetType === 'teacher') {
    return {
      targetType: 'teacher' as const,
      targetId: null,
      teacherIds: opts.teacherIds?.length ? opts.teacherIds : null,
      groupIds: null,
    };
  }
  if (opts.targetType === 'group') {
    return {
      targetType: 'group' as const,
      targetId: opts.targetId ?? null,
      teacherIds: null,
      groupIds: null,
    };
  }
  if (opts.targetType === 'groups') {
    return {
      targetType: 'group' as const,
      targetId: null,
      teacherIds: null,
      groupIds: opts.groupIds?.length ? opts.groupIds : null,
    };
  }
  return { targetType: 'all' as const, targetId: null, teacherIds: null, groupIds: null };
}

export async function adminUploadDocument(
  file: File,
  opts: {
    targetType: DocumentTargetType;
    targetId?: string | null;
    teacherIds?: string[];
    groupIds?: string[];
  }
) {
  const adminId = await assertAdmin();
  const docId = crypto.randomUUID();
  const safeName = sanitizeStorageFileName(file.name);
  const storagePath = `${docId}/${safeName}`;

  const uploaded = await uploadFile({
    bucket: STORAGE_BUCKETS.documents,
    path: storagePath,
    file,
    contentType: file.type || undefined,
  });

  if (!uploaded.ok) {
    return { error: uploaded.error };
  }

  const t = resolveDocumentRpcTarget(opts);

  const { data: doc, error: insertErr } = await supabase
    .from('documents')
    .insert({
      id: docId,
      title: file.name,
      file_name: file.name,
      storage_path: storagePath,
      storage_bucket: STORAGE_BUCKETS.documents,
      mime_type: file.type || null,
      uploaded_by: adminId,
      teacher_id: null,
      direction: 'admin_to_teacher',
      target_type: opts.targetType === 'groups' ? 'group' : opts.targetType,
      target_id: t.targetId,
    })
    .select('id')
    .single();

  if (insertErr || !doc) {
    await removeStorageFile(STORAGE_BUCKETS.documents, storagePath);
    return { error: insertErr?.message ?? 'Insert failed' };
  }

  const { data: assignedCount, error: assignErr } = await supabase.rpc('admin_assign_document_to_target', {
    p_document_id: doc.id,
    p_target_type: t.targetType,
    p_target_id: t.targetId,
    p_teacher_ids: t.teacherIds,
    p_group_ids: t.groupIds,
  });

  if (assignErr) {
    await supabase.from('documents').delete().eq('id', doc.id);
    await removeStorageFile(STORAGE_BUCKETS.documents, storagePath);
    return { error: assignErr.message };
  }

  if (!assignedCount || Number(assignedCount) < 1) {
    await supabase.from('documents').delete().eq('id', doc.id);
    await removeStorageFile(STORAGE_BUCKETS.documents, storagePath);
    return { error: 'No teachers matched the selected target' };
  }

  return { error: null, documentId: doc.id, signedUrl: uploaded.signedUrl };
}

export async function fetchDocumentDeliveries() {
  await assertAdmin();
  return supabase
    .from('document_recipients')
    .select('id, assigned_at, delivered_at, teacher_id, profiles:teacher_id(display_name), documents(id, title, file_name, target_type, created_at)')
    .order('assigned_at', { ascending: false });
}

export async function fetchAdminDocumentsForTeacher(teacherId: string) {
  await assertAdmin();
  return supabase
    .from('document_recipients')
    .select('assigned_at, documents(id, title, file_name, storage_path, mime_type, created_at)')
    .eq('teacher_id', teacherId)
    .order('assigned_at', { ascending: false });
}

export async function getSignedUrl(
  storagePath: string,
  bucket: typeof STORAGE_BUCKETS.documents | typeof STORAGE_BUCKETS.attachments | typeof STORAGE_BUCKETS.chatFiles = STORAGE_BUCKETS.documents
) {
  await assertAdmin();
  return createSignedStorageUrl(storagePath, bucket, 3600);
}

// ─── Chat ─────────────────────────────────────────────────────────────────────
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
    .select(
      'id, conversation_id, sender_id, receiver_id, body, attachment_url, attachment_name, attachment_type, created_at, updated_at, deleted_at'
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
}

export async function searchChatMessages(query: string, teacherId?: string) {
  await assertAdmin();
  let q = supabase
    .from('chat_messages')
    .select('id, body, created_at, deleted_at, conversation_id, sender_id, conversations(teacher_id)')
    .ilike('body', `%${query}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (teacherId) {
    const conv = await getTeacherConversation(teacherId);
    if (conv.data) q = q.eq('conversation_id', conv.data.id);
  }
  return q;
}

export async function sendAdminChatMessage(
  conversationId: string,
  adminId: string,
  teacherId: string,
  body: string,
  attachment?: { url: string; name: string; type?: string | null } | null
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
    attachment_url: attachment?.url ?? null,
    attachment_name: attachment?.name ?? null,
    attachment_type: attachment?.type ?? null,
  });
  return { error: error?.message ?? null };
}

/** Share an already-uploaded document in the teacher's chat thread. */
export async function shareDocumentInChat(
  teacherId: string,
  storagePath: string,
  fileName: string,
  mimeType?: string | null
) {
  const adminId = await assertAdmin();
  const conv = await getTeacherConversation(teacherId);
  if (conv.error || !conv.data) return { error: conv.error?.message ?? 'No conversation' };

  return sendAdminChatMessage(conv.data.id, adminId, teacherId, `📎 ${fileName}`, {
    url: storagePath,
    name: fileName,
    type: mimeType ?? null,
  });
}

export async function updateChatMessage(messageId: string, body: string) {
  await assertAdmin();
  return supabase
    .from('chat_messages')
    .update({ body })
    .eq('id', messageId);
}

export async function softDeleteChatMessage(messageId: string) {
  await assertAdmin();
  return supabase
    .from('chat_messages')
    .update({ deleted_at: new Date().toISOString(), body: 'Message deleted' })
    .eq('id', messageId);
}

export async function uploadChatAttachment(conversationId: string, file: File) {
  await assertAdmin();
  const safeName = sanitizeStorageFileName(file.name);
  const path = `${conversationId}/${crypto.randomUUID()}/${safeName}`;
  const uploaded = await uploadFile({
    bucket: STORAGE_BUCKETS.chatFiles,
    path,
    file,
    contentType: file.type || undefined,
  });
  if (!uploaded.ok) {
    return { error: uploaded.error, path: null, name: null, mimeType: null, signedUrl: null };
  }
  return {
    error: null,
    path: uploaded.storagePath,
    name: file.name,
    mimeType: file.type || null,
    signedUrl: uploaded.signedUrl,
  };
}

// ─── Availability ─────────────────────────────────────────────────────────────
export async function fetchTeacherAvailability(teacherId: string) {
  await assertAdmin();
  return supabase
    .from('teacher_availability')
    .select('*')
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false });
}

export type { Group, TeacherBroadcast, BroadcastFeedback, BroadcastAttachment };
