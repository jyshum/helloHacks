# hoppedIn: Commute Pods build plan (A/B split)

Repo: https://github.com/jyshum/helloHacks · Live: https://hellohacks-coral.vercel.app

## The product in one line
UBC students tell us **where they live** and **when they need to be on campus**. We match them into a
**pod** (one driver + riders on the same route and schedule) that rides together every week.
Riders win back time (the pod card shows "saves ~35 min vs transit"); everyone meets the same few
verified UBC students each week.

Decisions already made:
- **Mornings only** (to campus). Rides home come later.
- **Driver approves** every rider before they join.
- **No pricing** anywhere for now.
- The user never schedules anything. They answer 3 questions; the app does the rest.

## Existing features the pods flow reuses (don't rebuild these)
| Existing | Where | Used in pods for |
|---|---|---|
| UBC-only signup + email verification | `/signup`, `/verify` | Everyone in a pod is a verified UBC student |
| Profile photo upload | signup → `users.photo_url`, `components/Avatar.tsx` | Faces on pod cards, approval cards, chat |
| Profile pages + ratings | `/profile/[id]` | Driver taps a rider to see them before approving |
| License + car review (team approved) | `/driver-verify`, `/admin` | "License verified" badge + car photo on pod cards |
| Live trip screen | `/match/[requestId]` | Each pod day becomes a normal ride → same live map, Start/End, ratings |
| Presence / live location | `components/app/hooks.ts` | Driver-late detection on trip mornings |
| Address search + pin drop | `components/rider/LocationSearch.tsx` | "Where do you commute from?" |
| Detour calc (Directions API) | `lib/matching.ts` | Route-fit part of matching |

## Shared contract (already merged to main, already applied to the DB)
- DB: `supabase/migrations/20260929000000_commute_pods.sql`
  tables `commute_profiles, pods, pod_members, pod_messages, pod_trips, pod_skips, push_subscriptions`.
  RLS: clients can only **read** pods they're in; all writes go through API routes (service role).
  Realtime is on for `pod_messages, pod_members, pod_trips`.
- Types: `src/lib/pods/types.ts`
- `src/lib/notify.ts` → `notify(userIds, { kind, title, body, url })`. **A calls it, B implements it.** Must never throw.
- `src/lib/pods/chat.ts` → `postSystemMessage(podId, body)`. A posts automatic updates; B renders them.

Add columns/tables freely. **Don't rename or drop** anything in the contract without telling the other side.

---

## Partner A (Jared): matching + pods
- A1 `/commute` onboarding: **I drive / I need a ride** → home (address, GPS or pin) → days + arrive-by time (+ seats for drivers). Saves `commute_profiles`.
- A2 Matching engine `src/lib/pods/match.ts`: home prefilter (≤ 6 km) → arrival fit (driver arrives ≤ 15 min before rider's time, never after) → route fit (detour ≤ 8 min) → score (shared days ≫ time closeness > detour > same faculty/year bonus). Transit vs drive minutes via Directions. Re-runs on every profile save.
- A3 Pod screens `/pods`, `/pods/[id]`: invite card ("We found your pod"), Join, driver approval card (profile, detour, shared days, license/car), members + map + schedule, Leave.
- A4 Daily trips: nightly job creates `pod_trips`, asks driver to confirm, "Can't make it" (`pod_skips`), materializes a `rides` + `ride_requests` row per trip so `/match` works unchanged.
- A5 No-show detection: driver not moving 10 min before pickup → `driver_late`; not at pickup 10 min after → `driver_missed` + backup options. Reliability score on profiles.
- A6 Home: after login, pods become the main screen; today's on-demand map stays as "Need a ride today?".

## Partner B: chat + notifications
Build in this order. Each step must leave `npm run build` passing.

### B1. Pod group chat
- Component `src/components/pods/chat/PodChat.tsx` (`props: { podId: string; me: { id, full_name, photo_url } }`) and a page `/pods/[id]/chat` that renders it full-screen. A will link to it from the pod screen.
- API `src/app/api/pods/[id]/messages/route.ts`
  - `GET` → last 100 messages, oldest first, with sender `full_name` + `photo_url`.
  - `POST { body }` → only `pod_members.status = 'active'` can post. Trim, 1–2000 chars. Insert with the service-role client (`createAdminClient`), then call `notify(otherActiveMemberIds, { kind: "chat", ... })`.
  - Check membership server-side with `getProfile()` from `src/lib/profile.ts`.
- Live updates: Supabase Realtime `postgres_changes` INSERT on `pod_messages` filtered `pod_id=eq.<id>` (RLS already lets members receive it). Scroll to newest. Optimistic send.
- System messages (`kind = 'system'`) render as small centred grey text. User messages as bubbles with `Avatar`.
- Safety: long-press / ⋯ on a message → **Report**. Add a migration `pod_reports (id, pod_id, message_id, reporter_id, reason, created_at, resolved boolean)` and a "Reports" section on the existing `/admin` page (`src/components/admin/AdminReviews.tsx` is the pattern; admin check is `isAdmin()` in `src/lib/admin.ts`).
- Match the design system: `tailwind.config.ts` tokens (ubc, blue, sky, paper, line, muted), `.card`, `.btn-ubc`, Lucide icons (not emojis), mobile-first `max-w-app`.

### B2. Web push notifications
- `npm i web-push`. Generate VAPID keys (`npx web-push generate-vapid-keys`). Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT=mailto:hoppedinn@gmail.com`. **Ask Jared to add them to Vercel**; never commit keys.
- PWA: `public/manifest.webmanifest` (name hoppedIn, theme `#002145`, icons 192/512), link it in `src/app/layout.tsx`, service worker `public/sw.js` handling `push` (show notification) and `notificationclick` (focus/open `data.url`).
- `src/components/pods/EnableNotifications.tsx`: button that registers the SW, requests permission, subscribes, `POST /api/push/subscribe`. On iPhone Safari (not installed), show "Add hoppedIn to your Home Screen first" steps instead, since iOS only allows push for installed web apps.
- API `src/app/api/push/subscribe/route.ts`: `POST` upsert into `push_subscriptions` by endpoint; `DELETE` removes.
- **Implement `notify()` in `src/lib/notify.ts`** (keep the signature): look up subscriptions for the user ids, send with `web-push`, delete subscriptions that return 404/410, never throw.

### B3. Email fallback (if time)
- For users with no push subscription, send email for every kind **except `chat`** (too noisy).
- `npm i nodemailer`, Gmail SMTP (`smtp.gmail.com:587`) as `hoppedinn@gmail.com`. Env `SMTP_USER`, `SMTP_PASS` (a Gmail **app password**; Jared makes it and adds it to Vercel himself).
- Simple branded HTML: hoppedIn header, title, body, one "Open hoppedIn" button → `NEXT_PUBLIC_APP_URL + url`.

### How to test B without A's screens
Insert a pod by hand with the service role (one `pods` row + two `pod_members` rows with `status 'active'` for two test accounts), then open `/pods/<id>/chat` in two browsers. Use the dev-only "Skip verification" button on `/verify` to log in test accounts locally. Delete test accounts afterwards.

---

## Working together
- **Branches:** B works on `pods-b` and merges `main` in often. Open small PRs, one per step.
- **File ownership:** B owns `src/components/pods/chat/**`, `src/app/pods/[id]/chat/**`, `src/app/api/pods/[id]/messages/**`, `src/app/api/push/**`, `src/components/pods/EnableNotifications.tsx`, `src/lib/notify.ts` internals, `public/sw.js`, `public/manifest.webmanifest`. A owns everything else under `pods`. Touching the other side's files → ask first.
- **Migrations:** new file each time, timestamp after `20260929000000`. Apply with `npx supabase db push` (Jared has the credentials) or paste into the Supabase SQL editor.
- **Secrets:** get `.env.local` from Jared. Never commit it or any key.
- **Commits:** don't add `Co-Authored-By: Claude` lines. Jared doesn't want Claude listed as a repo contributor.
- Before every push: `npx tsc --noEmit && npm run lint && npm run build`.
