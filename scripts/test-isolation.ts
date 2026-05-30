/**
 * Verifies Teacher A cannot access Teacher B's data (RLS + scoped queries).
 *
 * Prerequisites:
 * - Migrations applied on Supabase
 * - Two teacher accounts created (sign up via mobile or Auth dashboard)
 *
 * Env (.env in project root):
 *   SUPABASE_URL=
 *   SUPABASE_ANON_KEY=
 *   TEACHER_A_EMAIL= / TEACHER_A_PASSWORD=
 *   TEACHER_B_EMAIL= / TEACHER_B_PASSWORD=
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const teacherA = {
  email: process.env.TEACHER_A_EMAIL,
  password: process.env.TEACHER_A_PASSWORD,
};
const teacherB = {
  email: process.env.TEACHER_B_EMAIL,
  password: process.env.TEACHER_B_PASSWORD,
};

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

async function signIn(email: string, password: string) {
  const client = createClient(url!, anonKey!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

async function main() {
  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  if (!teacherA.email || !teacherB.email) {
    throw new Error('Set TEACHER_A_* and TEACHER_B_* credentials in .env');
  }

  const a = await signIn(teacherA.email!, teacherA.password!);
  const b = await signIn(teacherB.email!, teacherB.password!);

  assert(a.userId !== b.userId, 'Teachers are distinct users');

  // 1) Profiles: Teacher A must not see Teacher B's profile
  const { data: profiles } = await a.client
    .from('profiles')
    .select('id, role, display_name');
  assert(
    profiles?.length === 1 && profiles[0].id === a.userId,
    'Teacher A only sees own profile (no PII leak)'
  );
  assert(
    !profiles?.some((p) => p.id === b.userId),
    'Teacher A cannot see Teacher B profile row'
  );

  // 2) Documents: explicit wrong teacher_id filter still returns nothing (RLS)
  const { data: bDocsAsA } = await a.client
    .from('documents')
    .select('id')
    .eq('teacher_id', b.userId);
  assert((bDocsAsA ?? []).length === 0, 'Teacher A cannot read Teacher B documents');

  // 3) Inbox isolation
  const { data: bInboxAsA } = await a.client
    .from('inbox_messages')
    .select('id')
    .eq('teacher_id', b.userId);
  assert((bInboxAsA ?? []).length === 0, 'Teacher A cannot read Teacher B inbox');

  // 4) Admin RPC blocked for teachers
  const { error: rpcErr } = await a.client.rpc('admin_list_teachers');
  assert(!!rpcErr, 'Teacher A cannot call admin_list_teachers');

  // 5) Conversations: cannot read other teacher conversation
  const { data: bConv } = await b.client
    .from('conversations')
    .select('id')
    .eq('teacher_id', b.userId)
    .single();

  if (bConv?.id) {
    const { data: msgs } = await a.client
      .from('chat_messages')
      .select('id')
      .eq('conversation_id', bConv.id);
    assert((msgs ?? []).length === 0, 'Teacher A cannot read Teacher B chat messages');
  }

  // 6) Storage signed URL path for other teacher (list)
  const { data: storageList } = await a.client.storage
    .from('teacher-documents')
    .list(b.userId);
  assert(
    (storageList ?? []).length === 0,
    'Teacher A cannot list Teacher B storage folder'
  );

  console.log('\nAll isolation checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
