# Consistency

A mobile-first, local-first PWA for reminders, time blocking and consistency
tracking — Apple Reminders × Google Calendar × the GitHub contribution graph,
with Linear's design sensibility.

- **Local-first**: every read/write hits IndexedDB (Dexie); works fully offline
  and syncs to Supabase automatically when online. No data loss, no duplicates
  (client-minted UUIDs + idempotent upserts).
- **Recurrence engine**: RFC 5545 RRULEs expanded on the fly, DST-safe by
  design (rules recur over local calendar dates; wall-clock times resolve per
  timezone). Occurrences materialize only when you interact with them.
- **Consistency tracking**: GitHub-style heatmap, streaks, perfect weeks,
  trends — all derived from a compact per-day statistics table.
- **Telegram notifications**: server-side (Supabase Edge Functions + pg_cron),
  so reminders arrive even when the app is closed.
- **PWA**: installable, offline app shell, update prompt, background-ready.

Full architecture notes: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Stack

React 19 · TypeScript (strict) · Vite · TailwindCSS v4 · shadcn-style UI ·
Framer Motion · Zustand · TanStack Query · Dexie · FullCalendar · Recharts ·
rrule · date-fns(-tz) · React Hook Form + Zod · Supabase (Postgres, Auth,
Realtime, Edge Functions) · Vitest.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev
```

No Supabase credentials? The app runs in **local-only mode** — everything
works on-device (no auth/sync/Telegram) — handy for development and demos.

### Scripts

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server                         |
| `npm run build`     | Typecheck + production build       |
| `npm test`          | Vitest suite (engine, sync, stats) |
| `npm run lint`      | ESLint                             |
| `npm run format`    | Prettier                           |

## Supabase setup

1. Create a project at [database.new](https://database.new).
2. Apply migrations (Supabase CLI):
   ```bash
   supabase link --project-ref <your-ref>
   supabase db push          # applies supabase/migrations/*
   ```
3. Deploy the edge functions:
   ```bash
   supabase functions deploy telegram-send notification-dispatch
   ```
4. Enable scheduled notifications (SQL editor, once):
   ```sql
   select vault.create_secret('https://<your-ref>.supabase.co', 'project_url');
   select vault.create_secret('<service-role-key>', 'service_role_key');
   ```
   The included migration schedules a pg_cron job that invokes the dispatcher
   every minute; it dedupes sends, so reruns are harmless.
5. (Optional) Seed demo data: `supabase/seed.sql` (see file header).

Auth email templates/redirects: add your deployed URL (e.g.
`https://<user>.github.io/consistency/`) to **Auth → URL Configuration**.

## Deploying to GitHub Pages

The included workflow (`.github/workflows/deploy.yml`) lints, tests, builds
and deploys on every push to `main`:

1. Push this repo to GitHub, name it e.g. `consistency`.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Add repo secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Push. Done — the SPA fallback (404.html) and PWA base path are handled.

> The Vite base path defaults to `/consistency/`; the workflow overrides it to
> `/<repo-name>/` automatically. For a custom domain set `VITE_BASE_PATH=/`.

## Telegram notifications

In **Settings → Telegram**: create a bot with [@BotFather](https://t.me/BotFather),
grab your chat id from [@userinfobot](https://t.me/userinfobot), paste both,
hit **Test connection**. Toggles: reminder alerts, missed reminders, morning
agenda, evening summary, weekly progress — all computed in your timezone,
delivered by the backend.

## Testing

`npm test` covers the highest-risk logic: recurrence expansion (incl. DST
transitions in three timezones), preset ⇄ RRULE round-trips, streak/statistics
math (ISO weeks, rest days, in-progress today), and the offline data layer
(atomic outbox writes, tombstone deletes, idempotent occurrence actions) over
fake-indexeddb.
