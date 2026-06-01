# UI/UX Redesign Summary — Genieclasses Teachers Portal

**Scope:** Visual and layout changes only. No changes to APIs, Supabase queries, auth logic, uploads, messaging, broadcasts, availability data, routes (existing paths preserved), or database schemas.

## Design system

| Token | Value |
|-------|--------|
| Primary background | `#FFFFFF` |
| Canvas / page bg | `#F8FAFC` |
| Green accents | `#DCFCE7`, `#BBF7D0`, `#22C55E`, `#16A34A` |
| Blue accents | `#DBEAFE`, `#BFDBFE`, `#3B82F6`, `#2563EB` |
| Card radius | 14–16px (`rounded-2xl`) |
| Typography | System sans; display/title/body/caption scale in Tailwind |
| Icons | Feather (`@expo/vector-icons`) on mobile; Lucide on admin-web |

## Deliverables

1. **Color palette** — `mobile/tailwind.config.js`, `admin-web/src/index.css`
2. **Typography scale** — Tailwind `fontSize` extensions + `gc-page-title` / `gc-page-subtitle`
3. **Global styles** — `mobile/global.css`, `admin-web/src/index.css` (`gc-*` components)
4. **Sign in** — `mobile/app/(auth)/login.tsx`, `admin-web/src/pages/LoginPage.tsx`
5. **Sign up** — Same mobile screen (mode toggle); strength meter, improved hierarchy
6. **Authenticated header** — `mobile/components/AppHeader.tsx` on all teacher tabs
7. **Bottom navigation** — 5 tabs: Inbox, Documents, Chat, Calendar, Profile
8. **Admin dashboard UI** — Sidebar layout, stat cards, tables, forms
9. **Teacher portal UI** — Inbox, documents, chat, calendar, profile screens
10. **Responsive admin** — Fixed sidebar + scrollable main on desktop

## Files modified

### Mobile (`teacher-portal/mobile/`)

| File | Changes |
|------|---------|
| `tailwind.config.js` | Green/blue palette, shadows, typography |
| `global.css` | Tailwind layers (unchanged structure) |
| `package.json` | Added `@expo/vector-icons` |
| `components/Logo.tsx` | **New** — brand mark |
| `components/AppHeader.tsx` | **New** — portal title, bell, profile avatar |
| `components/PasswordStrength.tsx` | **New** — signup visual only |
| `components/LoadingScreen.tsx` | Styled loader |
| `components/ErrorBanner.tsx` | Icon + card style |
| `components/ui/Card.tsx` | **New** — elevated card |
| `components/ui/EmptyState.tsx` | **New** — empty states |
| `app/(auth)/login.tsx` | Full login/signup redesign |
| `app/(teacher)/_layout.tsx` | Header, tab bar, Profile tab |
| `app/(teacher)/profile.tsx` | **New** — profile + sign out (moved from header) |
| `app/(teacher)/inbox.tsx` | Broadcast cards, detail view |
| `app/(teacher)/documents.tsx` | Search, file cards, upload CTA |
| `app/(teacher)/chat.tsx` | Bubbles, input bar, attachments |
| `app/(teacher)/availability.tsx` | Calendar styling, green/blue toggles |

### Admin web (`teacher-portal/admin-web/`)

| File | Changes |
|------|---------|
| `package.json` | Added `lucide-react` |
| `src/index.css` | Design tokens + `gc-*` utilities |
| `src/App.tsx` | Loading state styling |
| `src/components/AdminLayout.tsx` | Sidebar navigation + header |
| `src/pages/LoginPage.tsx` | Split layout, branded card |
| `src/pages/TeachersPage.tsx` | Stat cards, list styling |
| `src/pages/DocumentsPage.tsx` | Cards, tables, upload zone |
| `src/pages/GroupsPage.tsx` | Forms and selection states |
| `src/pages/BroadcastsPage.tsx` | Form card, list styling |
| `src/components/TeacherDetailPanel.tsx` | Tab styling |

## Behavior preserved

- All `lib/api.ts`, `features.ts`, auth, storage upload, and Supabase calls unchanged
- Tab route names: `inbox`, `documents`, `chat`, `availability` (Calendar label only)
- New **`profile`** tab is UI-only (sign out + display info via existing `useAuth`)
- Remember me / forgot password on login are **visual** (no new persistence or reset API)

## Build verification

- `admin-web`: `npm run build` — pass
- `mobile`: `npx tsc --noEmit` — pass after `@expo/vector-icons` install (profile route may need `expo start` to refresh typed routes)

## Manual QA checklist

- [ ] Teacher login / signup flow
- [ ] Header visible on all 5 tabs
- [ ] Upload document, chat attach, broadcast read/feedback
- [ ] Admin login + all sidebar pages
- [ ] Teacher detail chat/documents/availability
