import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

export type Profile = {
  id: string;
  role: 'teacher' | 'admin';
  display_name: string | null;
  push_token: string | null;
};

export type InboxMessage = {
  id: string;
  teacher_id: string;
  subject: string;
  body: string;
  is_read: boolean;
  created_at: string;
};

export type DocumentRow = {
  id: string;
  teacher_id: string;
  title: string;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
};

export type Conversation = {
  id: string;
  teacher_id: string;
  created_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
};
