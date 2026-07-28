# Consistency — Architecture

A mobile-first, local-first PWA for reminders, time blocking, and consistency tracking.
Frontend on GitHub Pages, backend on Supabase.

## 1. System overview

```
┌─────────────────────────────── Browser (PWA) ───────────────────────────────┐
│                                                                             │
│  React 19 + TS  ──  Pages / Features / Components (shadcn + Tailwind)       │
│        │                                                                    │
│  TanStack Query  ──  hooks (useReminders, useOccurrences, useStats, …)      │
│        │                                                                    │
│  Repository layer (services/repositories)   ← single source of data access  │
│        │                                                                    │
│  Dexie (IndexedDB)  ← local-first store: every read/write hits Dexie first  │
│        │                                                                    │
│  Sync Engine (outbox push / incremental pull / realtime)                    │
│        │                                                                    │
└────────┼────────────────────────────────────────────────────────────────────┘
         │  HTTPS + WebSocket
┌────────▼──────────────────── Supabase ──────────────────────────────────────┐
│  Postgres (RLS on every table)   Auth (email/password, magic link)          │
│  Realtime (postgres_changes)     Edge Functions (Telegram)                  │
│  pg_cron + pg_net  →  scheduled notification dispatch                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why local-first (not cache-as-fallback)

Offline is a hard requirement. If Supabase were the primary store with IndexedDB as a
fallback cache, every feature would need two code paths. Instead **Dexie is the only
store the UI talks to**. The sync engine reconciles Dexie ⇄ Supabase in the background.
Benefits: instant optimistic UI everywhere, one code path, offline is free.

## 2. Data model

Tables (all owned by `user_id uuid references auth.users`, full RLS):

| Table                | Purpose                                                        |
|----------------------|----------------------------------------------------------------|
| `profiles`           | Display name, avatar, timezone. 1:1 with auth user.            |
| `user_preferences`   | Theme, accent, week start, calendar defaults. 1:1.             |
| `categories`         | User categories (name, color, icon).                           |
| `time_blocks`        | Recurring day-template blocks (start/end time, color, icon).   |
| `reminders`          | The reminder "series" definition incl. RRULE.                  |
| `reminder_occurrences`| Materialized per-instance state (done/skipped/snoozed/notes). |
| `completion_logs`    | Append-only audit of complete/undo events.                     |
| `daily_statistics`   | Per-day rollup (due, completed, score) for fast heatmaps.      |
| `telegram_settings`  | Bot token, chat id, notification toggles, quiet hours.         |
| `sync_queue`         | Server-side dead-letter for failed pushes (diagnostics).       |
| `activity_logs`      | Recent activity feed events.                                   |

### Recurrence model (the critical design decision)

A reminder row stores its schedule as `rrule` (RFC 5545 string) + `dtstart` + timezone.
Occurrences are **never bulk-materialized**. Instead:

- **Display**: the recurrence engine (`src/lib/recurrence`) expands occurrences on the
  fly for any window (calendar view, dashboard, agenda). Pure function, heavily tested.
- **Interaction**: completing / skipping / snoozing / annotating a specific occurrence
  creates one `reminder_occurrences` row keyed `(reminder_id, occurrence_date)` (unique).
  This row *overrides* the virtual occurrence.

This keeps the DB small, makes "edit series" trivial (no rows to rewrite), and is
DST-safe because expansion happens in the reminder's timezone via `rrule` + `date-fns-tz`.

An occurrence's canonical identity is `occurrence_date` = the **local calendar date**
(`yyyy-MM-dd`) of the instance in the reminder's timezone. Times may shift with DST;
the calendar date does not.

### Streaks & statistics

`daily_statistics` holds one row per user per local date: `due_count`,
`completed_count`, `score` (0–1). It is recomputed client-side for the affected date on
every completion change (cheap: one date at a time) and upserted. Streaks, heatmap, and
trends are derived from this table — O(days), not O(occurrences).

## 3. Sync engine

Outbox pattern with LWW conflict resolution.

- Every local mutation writes Dexie **and** appends an `outbox` entry
  `{table, op, payload, timestamp}` in the same Dexie transaction.
- **Push**: when online, the outbox drains FIFO to Supabase (upsert/delete). IDs are
  client-generated UUIDv4, so retries and multi-device creates are idempotent — no
  duplicates by construction.
- **Pull**: incremental — `where updated_at > last_pulled_at` per table (indexed).
  Deletes are soft (`deleted_at` tombstone) so they replicate; tombstones filtered from
  all queries and purged after 30 days.
- **Realtime**: `postgres_changes` subscription applies remote rows straight into Dexie
  (skipping echoes of our own pushes via `updated_by_device` id).
- **Conflicts**: last-write-wins on `updated_at` (server clock on push). Field-level
  merging is deliberately avoided — for a personal reminders app, LWW at row level is
  correct 99.9% of the time and vastly simpler to reason about.
- **Status**: the engine exposes `idle | syncing | offline | error` + pending count to a
  status pill in the UI.

## 4. Telegram notifications

GitHub Pages is static — nothing runs when the browser is closed. So scheduled sends
live in Supabase:

- `telegram-send` Edge Function: validates payload, sends via Bot API, retries with
  backoff, respects Telegram 429s.
- `notification-dispatch` Edge Function: invoked every minute by `pg_cron` + `pg_net`.
  Computes due reminder alerts, morning agenda, evening summary per user (in each
  user's timezone) and calls `telegram-send`.
- Test-connection runs from the client via the Edge Function (never exposing patterns
  beyond the user's own token, which is their own bot's token stored under RLS).

## 5. Frontend architecture

Feature-first layout:

```
src/
  app/            App shell, router, providers
  components/ui/  shadcn primitives (design system)
  components/     Shared composite components (AppShell, EmptyState, …)
  features/
    auth/  dashboard/  reminders/  calendar/  timeblocks/
    tracking/  statistics/  telegram/  search/  settings/
  hooks/          Cross-feature hooks (useOnline, useMediaQuery, …)
  lib/            Pure logic: recurrence/, dates/, streaks/, utils
  services/
    db/           Dexie schema + repositories
    supabase/     Client, generated types
    sync/         Sync engine
    telegram/     Client-side telegram service (test, settings)
  store/          Zustand stores (ui, settings, sync-status)
  types/          Domain types (single source of truth)
  styles/         Tailwind entry + design tokens
supabase/
  migrations/     SQL migrations
  functions/      Edge functions (Deno)
  seed.sql        Demo seed data
```

- **TanStack Query** is the UI's data interface. Query functions call repositories
  (Dexie). The sync engine and repositories emit invalidation events → queries refetch
  from Dexie (fast, local). Optimistic updates are unnecessary in most paths because
  writes land in Dexie synchronously before invalidation.
- **Zustand** holds client state only: UI (sheets, dialogs, command palette), settings
  mirror, sync status. Server-derived state never lives in Zustand.
- **Routing**: React Router with the GitHub Pages 404-redirect pattern (clean URLs).
- **PWA**: `vite-plugin-pwa`, precache app shell, runtime cache fonts; custom update
  toast ("New version available").

## 6. Design system

Dark-first. Design tokens as CSS variables (HSL) consumed by Tailwind v4 `@theme`.
Accent color is a runtime CSS-variable swap (8 presets). Typography: Inter var.
Radius scale is generous (`--radius: 0.75rem`). Motion: Framer Motion with a global
`useReducedMotion` guard; durations 150–300 ms, standard easing curves only.

## 7. Security

- RLS on every table: `user_id = auth.uid()` for all four verbs; no service keys ship
  to the client (only `anon` key, which RLS constrains).
- All external input validated with Zod at the form boundary *and* before repository
  writes.
- Telegram bot token: stored per-user in `telegram_settings` (RLS-protected), never
  logged, masked in UI, and only ever sent to the user's own Edge Function.

## 8. Testing strategy

Vitest. Highest-value targets, in order:
1. **Recurrence engine** — expansion, DST transitions, timezones, EXDATE, overrides.
2. **Streak/statistics math** — streaks across gaps, timezone day boundaries.
3. **Sync engine** — outbox ordering, idempotent retry, LWW merge, tombstones.
4. Repositories (fake-indexeddb) and critical components (Testing Library).
