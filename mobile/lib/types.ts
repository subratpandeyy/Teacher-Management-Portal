/** Portal types for mobile (keep in sync with ../shared/types.ts). */

export type BroadcastTargetType = 'all' | 'group' | 'groups' | 'teacher';
export type DocumentTargetType = 'all' | 'group' | 'groups' | 'teacher';

export type Group = {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
  creator_role?: string | null;
  type?: string;
  membership_rules?: string | null;
};

export type GroupMember = {
  id: string;
  group_id: string;
  teacher_id: string;
  created_at: string;
};

export type BroadcastAttachment = {
  id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
};

export type BroadcastRow = {
  id: string;
  title: string;
  message: string;
  body?: string;
  attachment_url: string | null;
  attachment_name: string | null;
  target_type: BroadcastTargetType;
  target_id: string | null;
  published_at: string | null;
  created_at: string;
};

export type TeacherBroadcast = {
  recipient_id: string;
  broadcast_id: string;
  title: string;
  message: string;
  published_at: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachments: BroadcastAttachment[];
  read_at: string | null;
  created_at: string;
};

export type BroadcastFeedback = {
  id: string;
  broadcast_id: string;
  teacher_id: string;
  feedback_text: string;
  created_at: string;
  updated_at: string;
};

export type AssignedDocument = {
  id: string;
  title: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  assigned_at: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string | null;
  body: string;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
