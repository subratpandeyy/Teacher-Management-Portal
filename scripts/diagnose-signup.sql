-- Run in Supabase SQL Editor to diagnose "Database error saving new user"
-- Copy results and compare against expected output in comments.

-- 1. Enum values (must include coordinator, student)
SELECT unnest(enum_range(NULL::public.user_role)) AS user_role_value;

-- 2. Live trigger function body (should contain set_config('row_security', 'off'))
SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);

-- 3. Function owner (should be postgres)
SELECT p.proname, r.rolname AS owner, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_roles r ON r.oid = p.proowner
WHERE p.proname = 'handle_new_user';

-- 4. RLS status on signup-related tables
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS force_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'conversations', 'conversation_participants')
ORDER BY c.relname;

-- 5. Policies on profiles (INSERT policy optional; trigger bypasses via row_security off)
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS check_expr
FROM pg_policy
WHERE polrelid = 'public.profiles'::regclass
ORDER BY polname;

-- 6. conversations unique constraint (should NOT exist — blocks ON CONFLICT (teacher_id))
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.conversations'::regclass
  AND contype = 'u';

-- 7. conversations.type column (required for duplex chat trigger)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'conversations'
ORDER BY ordinal_position;

-- 8. Applied migrations (confirm 20260608000002 is latest)
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version DESC
LIMIT 10;
