# Teacher Portal

Multi-tenant teacher platform with **Supabase RLS** as the primary security boundary, an **Expo (React Native)** mobile app for teachers, and a **React admin web panel**.

Teachers only ever see their own inbox, documents, and chat. Admins see all teachers via the web panel, with UI queries explicitly scoped per selected teacher.

## Repository layout

| Path | Description |
|------|-------------|
| `mobile/` | Expo + TypeScript + NativeWind (teacher app) |
| `admin-web/` | Vite + React + Tailwind (admin panel) |
| `supabase/migrations/` | Schema, RLS, storage policies |
| `scripts/test-isolation.ts` | Automated cross-teacher access tests |

## 1. Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and create a project.
2. Note **Project URL** and **anon public** key (Settings → API).
3. Enable **Realtime** for `public.chat_messages` (Database → Replication), or run migrations that add the table to the `supabase_realtime` publication.

## 2. Apply database migrations

**Option A — Supabase CLI**

```bash
cd teacher-portal
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

**Option B — SQL Editor**

Run each file in `supabase/migrations/` in order in the Supabase SQL editor.

## 3. Create an admin user

1. Sign up a user in Supabase Auth (or via the mobile app).
2. Promote to admin in SQL:

```sql
UPDATE public.profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
```

Admins must use the **web panel** (`admin-web`). The mobile app redirects admin accounts back to login with a hint.

## 4. Configure Supabase Auth redirect URLs (required for email verification)

Email confirmation must open the **mobile app**, not `http://localhost:3000`.

1. Start the app once and check the Metro log for:

   ```txt
   [auth] Supabase emailRedirectTo: exp://.../--/auth/callback
   ```

   (or `teacherportal://auth/callback` in standalone builds)

2. In **Supabase Dashboard → Authentication → URL Configuration**:

   | Field | Value |
   |-------|--------|
   | **Site URL** | `teacherportal://auth/callback` |
   | **Redirect URLs** (add each) | `teacherportal://auth/callback` |
   | | `teacherportal://**` |
   | | `exp://**/--/auth/callback` |
   | | Your exact Expo Go URL from the Metro log |

3. Remove `http://localhost:3000` from Redirect URLs unless you use the admin web panel for auth.

Signup sends `emailRedirectTo: Linking.createURL('auth/callback')` so verification links deep-link into `app/(auth)/callback.tsx`.

## 5. Environment variables

**Mobile** — copy `mobile/.env.example` → `mobile/.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Admin web** — copy `admin-web/.env.example` → `admin-web/.env`:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Isolation test** — copy `.env.example` → `.env` at repo root and set teacher A/B credentials.

## 6. Run the mobile app

```bash
cd mobile
npm install
npx expo start
```

Use Expo Go or a simulator. Teachers can **sign up** from the login screen (role defaults to `teacher`; signup cannot self-assign `admin`).

## 7. Run the admin panel

```bash
cd admin-web
npm install
npm run dev
```

Open the printed local URL and sign in with your **admin** account.

## 8. Push notifications (Expo)

**Expo Go:** push is disabled automatically (no crash). Use a development build or production build for real push.

For EAS / dev-client builds, add the `expo-notifications` plugin to `mobile/app.config.ts` (see comment in that file).

1. Configure EAS / Expo project ID in `app.json` under `extra.eas.projectId` if using EAS Build.
2. On a physical device, the app requests notification permission and saves the Expo push token to `profiles.push_token`.
3. Send pushes from a Supabase Edge Function or your backend using [Expo push API](https://docs.expo.dev/push-notifications/sending-notifications/) and stored tokens.

## 9. Security model

| Layer | Behavior |
|-------|----------|
| **RLS** | Primary defense on all tables + storage |
| **App queries** | Teachers always `.eq('teacher_id', user.id)` |
| **Profiles** | No email in `profiles`; teachers only `SELECT` own row |
| **Admin RPC** | `admin_list_teachers()` is `SECURITY DEFINER` and checks `is_admin()` |
| **Files** | Private bucket `teacher-documents`; access via **signed URLs** only |
| **Admin UI** | Every fetch filtered by selected `teacherId` (defense in depth) |

## 10. Run isolation tests

Create two teacher accounts, then:

```bash
cd teacher-portal
cp .env.example .env
# fill in credentials
npm run test:isolation
```

Expected output: all `PASS` lines and `All isolation checks passed.`

## 11. Optional: Supabase local dev

```bash
npx supabase start
npx supabase db reset
```

## Troubleshooting

- **Chat not updating live**: confirm `chat_messages` is in the Realtime publication.
- **Upload fails**: check storage bucket `teacher-documents` exists and policies are applied.
- **Admin cannot list teachers**: ensure `profiles.role = 'admin'` for your user.
- **NativeWind styles missing**: restart Metro with `npx expo start -c`.

## License

MIT
