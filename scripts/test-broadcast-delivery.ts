/**
 * Broadcast Delivery Validation Tests
 *
 * Verifies that broadcasts are correctly delivered to the intended recipients
 * with no cross-role leakage, across all target types.
 *
 * Prerequisites:
 * - Migrations applied (especially the fix_broadcast_targeting migration)
 * - Admin, coordinator, teacher, and student accounts exist
 *
 * Env (.env in project root):
 *   SUPABASE_URL=
 *   SUPABASE_ANON_KEY=
 *   ADMIN_EMAIL= / ADMIN_PASSWORD=
 *   COORDINATOR_EMAIL= / COORDINATOR_PASSWORD=
 *   TEACHER_EMAIL= / TEACHER_PASSWORD=
 *   STUDENT_EMAIL= / STUDENT_PASSWORD=
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    failCount++;
    console.error(`  FAIL: ${message}`);
  } else {
    passCount++;
    console.log(`  PASS: ${message}`);
  }
}

async function signIn(email: string, password: string) {
  const client = createClient(url!, anonKey!);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}

async function getProfile(client: SupabaseClient, userId: string) {
  const { data } = await client
    .from('profiles')
    .select('id, role, display_name')
    .eq('id', userId)
    .single();
  return data;
}

async function createTestBroadcast(
  client: SupabaseClient,
  title: string,
  targetType: string,
  targetId: string | null = null,
  teacherIds: string[] | null = null,
  groupIds: string[] | null = null
) {
  const { data, error } = await client.rpc('admin_create_broadcast', {
    p_title: title,
    p_message: `Test message for ${targetType}`,
    p_target_type: targetType,
    p_target_id: targetId,
    p_teacher_ids: teacherIds,
    p_group_ids: groupIds,
  });
  return { broadcastId: data as string | null, error };
}

async function getRecipients(client: SupabaseClient, broadcastId: string) {
  const { data } = await client
    .from('broadcast_recipients')
    .select('id, teacher_id')
    .eq('broadcast_id', broadcastId);
  return data ?? [];
}

async function getInbox(client: SupabaseClient, userId: string, role: string) {
  if (role === 'teacher') {
    const { data } = await client.rpc('teacher_my_broadcasts');
    return data ?? [];
  }
  const { data } = await client
    .from('broadcast_recipients')
    .select('id, broadcast_id, broadcast:broadcasts!inner(id, title, target_type)')
    .eq('teacher_id', userId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

async function main() {
  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  const emailRequired = [
    'ADMIN_EMAIL', 'ADMIN_PASSWORD',
    'COORDINATOR_EMAIL', 'COORDINATOR_PASSWORD',
    'TEACHER_EMAIL', 'TEACHER_PASSWORD',
    'STUDENT_EMAIL', 'STUDENT_PASSWORD',
  ];
  for (const key of emailRequired) {
    if (!process.env[key]) throw new Error(`Set ${key} in .env`);
  }

  console.log('\n=== Signing in ===');
  const admin = await signIn(process.env.ADMIN_EMAIL!, process.env.ADMIN_PASSWORD!);
  const coordinator = await signIn(process.env.COORDINATOR_EMAIL!, process.env.COORDINATOR_PASSWORD!);
  const teacher = await signIn(process.env.TEACHER_EMAIL!, process.env.TEACHER_PASSWORD!);
  const student = await signIn(process.env.STUDENT_EMAIL!, process.env.STUDENT_PASSWORD!);

  console.log('\n=== Role Verification ===');
  const adminProfile = await getProfile(admin.client, admin.userId);
  const coordProfile = await getProfile(coordinator.client, coordinator.userId);
  const teacherProfile = await getProfile(teacher.client, teacher.userId);
  const studentProfile = await getProfile(student.client, student.userId);

  assert(adminProfile?.role === 'admin', `Admin role is 'admin' (got '${adminProfile?.role}')`);
  assert(coordProfile?.role === 'coordinator', `Coordinator role is 'coordinator' (got '${coordProfile?.role}')`);
  assert(teacherProfile?.role === 'teacher', `Teacher role is 'teacher' (got '${teacherProfile?.role}')`);
  assert(studentProfile?.role === 'student', `Student role is 'student' (got '${studentProfile?.role}')`);

  const allUserIds = [admin.userId, coordinator.userId, teacher.userId, student.userId];

  // ─── Test 1: Admin → Everyone ──────────────────────────────────────────────
  console.log('\n=== Test 1: Admin → Everyone ===');
  const result1 = await createTestBroadcast(admin.client, 'Test: Everyone', 'all');
  assert(!result1.error, `create_broadcast(all) succeeded (error: ${result1.error?.message ?? 'none'})`);

  if (result1.broadcastId) {
    const recipients = await getRecipients(admin.client, result1.broadcastId);
    const recipientIds = recipients.map(r => r.teacher_id);
    const matchCount = allUserIds.filter(id => recipientIds.includes(id)).length;
    assert(matchCount === 4, `Everyone broadcast reached all 4 roles (got ${matchCount})`);
    assert(recipientIds.includes(admin.userId), 'Admin is a recipient');
    assert(recipientIds.includes(coordinator.userId), 'Coordinator is a recipient');
    assert(recipientIds.includes(teacher.userId), 'Teacher is a recipient');
    assert(recipientIds.includes(student.userId), 'Student is a recipient');

    const inboxes = await Promise.all(
      [admin, coordinator, teacher, student].map(u => getInbox(u.client, u.userId, u.profile?.role ?? ''))
    );
    assert(inboxes[0].some((r: any) => r.broadcast_id === result1.broadcastId), 'Admin sees everyone broadcast');
    assert(inboxes[1].some((r: any) => r.broadcast_id === result1.broadcastId), 'Coordinator sees everyone broadcast');
    assert(inboxes[2].some((r: any) => r.broadcast_id === result1.broadcastId), 'Teacher sees everyone broadcast');
    assert(inboxes[3].some((r: any) => r.broadcast_id === result1.broadcastId), 'Student sees everyone broadcast');
  }

  // ─── Test 2: Admin → Teachers ──────────────────────────────────────────────
  console.log('\n=== Test 2: Admin → Teachers ===');
  const result2 = await createTestBroadcast(admin.client, 'Test: Teachers Only', 'teacher');
  assert(!result2.error, `create_broadcast(teacher) succeeded (error: ${result2.error?.message ?? 'none'})`);

  if (result2.broadcastId) {
    const recipients = await getRecipients(admin.client, result2.broadcastId);
    const recipientIds = recipients.map(r => r.teacher_id);
    assert(recipientIds.includes(teacher.userId), 'Teacher broadcast reached teacher');
    assert(!recipientIds.includes(coordinator.userId), 'Teacher broadcast did NOT reach coordinator');
    assert(!recipientIds.includes(student.userId), 'Teacher broadcast did NOT reach student');

    const inboxes = await Promise.all(
      [coordinator, student].map(u => getInbox(u.client, u.userId, u.profile?.role ?? ''))
    );
    assert(!inboxes[0].some((r: any) => r.broadcast_id === result2.broadcastId), 'Coordinator inbox does NOT show teacher broadcast');
    assert(!inboxes[1].some((r: any) => r.broadcast_id === result2.broadcastId), 'Student inbox does NOT show teacher broadcast');
  }

  // ─── Test 3: Admin → Coordinators ──────────────────────────────────────────
  console.log('\n=== Test 3: Admin → Coordinators ===');
  const result3 = await createTestBroadcast(admin.client, 'Test: Coordinators Only', 'coordinator');
  assert(!result3.error, `create_broadcast(coordinator) succeeded (error: ${result3.error?.message ?? 'none'})`);

  if (result3.broadcastId) {
    const recipients = await getRecipients(admin.client, result3.broadcastId);
    const recipientIds = recipients.map(r => r.teacher_id);
    assert(recipientIds.includes(coordinator.userId), 'Coordinator broadcast reached coordinator');
    assert(!recipientIds.includes(teacher.userId), 'Coordinator broadcast did NOT reach teacher');
    assert(!recipientIds.includes(student.userId), 'Coordinator broadcast did NOT reach student');

    const inboxes = await Promise.all(
      [teacher, student].map(u => getInbox(u.client, u.userId, u.profile?.role ?? ''))
    );
    assert(!inboxes[0].some((r: any) => r.broadcast_id === result3.broadcastId), 'Teacher inbox does NOT show coordinator broadcast');
    assert(!inboxes[1].some((r: any) => r.broadcast_id === result3.broadcastId), 'Student inbox does NOT show coordinator broadcast');
  }

  // ─── Test 4: Admin → Students ──────────────────────────────────────────────
  console.log('\n=== Test 4: Admin → Students ===');
  const result4 = await createTestBroadcast(admin.client, 'Test: Students Only', 'student');
  assert(!result4.error, `create_broadcast(student) succeeded (error: ${result4.error?.message ?? 'none'})`);

  if (result4.broadcastId) {
    const recipients = await getRecipients(admin.client, result4.broadcastId);
    const recipientIds = recipients.map(r => r.teacher_id);
    assert(recipientIds.includes(student.userId), 'Student broadcast reached student');
    assert(!recipientIds.includes(teacher.userId), 'Student broadcast did NOT reach teacher');
    assert(!recipientIds.includes(coordinator.userId), 'Student broadcast did NOT reach coordinator');

    const inboxes = await Promise.all(
      [coordinator, teacher].map(u => getInbox(u.client, u.userId, u.profile?.role ?? ''))
    );
    assert(!inboxes[0].some((r: any) => r.broadcast_id === result4.broadcastId), 'Coordinator inbox does NOT show student broadcast');
    assert(!inboxes[1].some((r: any) => r.broadcast_id === result4.broadcastId), 'Teacher inbox does NOT show student broadcast');
  }

  // ─── Test 5: Cross-role isolation ──────────────────────────────────────────
  console.log('\n=== Test 5: Cross-role isolation ===');
  const { data: coordSeesAll } = await coordinator.client
    .from('broadcast_recipients')
    .select('id, broadcast_id')
    .eq('teacher_id', teacher.userId);
  assert((coordSeesAll ?? []).length === 0, 'Coordinator cannot read another user\'s recipient records');

  const { data: studentSeesAll } = await student.client
    .from('broadcast_recipients')
    .select('id, broadcast_id')
    .eq('teacher_id', teacher.userId);
  assert((studentSeesAll ?? []).length === 0, 'Student cannot read another user\'s recipient records');

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passCount} passed, ${failCount} failed ===`);
  if (failCount > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
