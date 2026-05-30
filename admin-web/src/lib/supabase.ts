import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, key);

export type TeacherRow = {
  id: string;
  display_name: string | null;
  email: string;
  created_at: string;
};
