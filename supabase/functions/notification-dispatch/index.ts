// notification-dispatch — invoked every minute by pg_cron (service role).
// Computes, per user and in the user's own timezone: due reminder alerts,
// missed-reminder alerts, morning agenda, evening summary and weekly progress,
// then delivers via Telegram. Idempotent: every send is deduped through
// notification_log (unique user_id + dedupe_key).

import { createClient } from 'npm:@supabase/supabase-js@2'
// esm.sh build: the raw npm package fails to boot in the Deno edge runtime
// (CJS interop), esm.sh serves a proper ESM bundle.
import { RRule } from 'https://esm.sh/rrule@2.8.1'
import { esc, sendTelegramMessage } from '../_shared/telegram.ts'

type Supabase = ReturnType<typeof createClient>

// How far back a "minute window" reaches. Cron can jitter or skip; a 10 min
// lookback plus dedupe means late runs still deliver exactly once.
const LOOKBACK_MIN = 10
const MISSED_AFTER_MIN = 30

Deno.serve(async (req) => {
  // Only the service role (pg_cron) may invoke this. The gateway has already
  // verified the JWT signature (verify_jwt); authorize on the role claim
  // rather than byte-equality with the env key, which breaks across key
  // rotations/re-signings.
  if (!isServiceRole(req.headers.get('Authorization') ?? '')) {
    return new Response('Unauthorized', { status: 401 })
  }

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey)

  const { data: users, error } = await supabase
    .from('telegram_settings')
    .select(
      `user_id, bot_token, chat_id, enabled, notify_reminders, notify_missed,
       morning_agenda, morning_agenda_time, evening_summary, evening_summary_time,
       weekly_progress, weekly_progress_day`
    )
    .eq('enabled', true)
    .neq('bot_token', '')
    .neq('chat_id', '')

  if (error) return json({ ok: false, detail: error.message }, 500)

  // Timezones live on profiles; both tables key off auth.users (no direct FK),
  // so fetch them in one extra query instead of a PostgREST embed.
  const userIds = (users ?? []).map((u) => u.user_id)
  const timezones = new Map<string, string>()
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, timezone')
      .in('id', userIds)
    for (const p of profiles ?? []) timezones.set(p.id, p.timezone)
  }

  const now = new Date()
  let sent = 0

  for (const u of users ?? []) {
    try {
      sent += await processUser(supabase, u, timezones.get(u.user_id) ?? 'UTC', now)
    } catch (err) {
      console.error(`dispatch failed for user ${u.user_id}:`, err)
    }
  }

  return json({ ok: true, sent })
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processUser(
  supabase: Supabase,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  u: any,
  tz: string,
  now: Date
): Promise<number> {
  const local = getLocalParts(now, tz)
  const today = local.date
  let sent = 0

  const occurrences = await todaysOccurrences(supabase, u.user_id, today, tz)

  // --- Per-reminder alerts -------------------------------------------------
  if (u.notify_reminders) {
    for (const occ of occurrences) {
      if (occ.status !== 'pending' || !occ.notify || occ.allDay) continue
      const notifyAt = new Date(
        occ.scheduledAt.getTime() - occ.notifyMinutesBefore * 60_000
      )
      if (inWindow(notifyAt, now)) {
        const when = formatTime(occ.scheduledAt, tz)
        const ok = await deliver(supabase, u, {
          kind: 'reminder',
          dedupeKey: `reminder:${occ.reminderId}:${today}`,
          text: `⏰ <b>${esc(occ.title)}</b>\n${when}${occ.description ? `\n${esc(occ.description)}` : ''}`,
        })
        if (ok) sent++
      }
    }
  }

  // --- Missed reminders ----------------------------------------------------
  if (u.notify_missed) {
    for (const occ of occurrences) {
      if (occ.status !== 'pending' || occ.allDay) continue
      const missedAt = new Date(occ.scheduledAt.getTime() + MISSED_AFTER_MIN * 60_000)
      if (inWindow(missedAt, now)) {
        const ok = await deliver(supabase, u, {
          kind: 'missed',
          dedupeKey: `missed:${occ.reminderId}:${today}`,
          text: `⚠️ <b>Missed:</b> ${esc(occ.title)}\nScheduled for ${formatTime(occ.scheduledAt, tz)}. Still pending.`,
        })
        if (ok) sent++
      }
    }
  }

  // --- Morning agenda ------------------------------------------------------
  if (u.morning_agenda && atLocalTime(local, u.morning_agenda_time)) {
    const pending = occurrences.filter((o) => o.status === 'pending')
    const lines = pending
      .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
      .slice(0, 15)
      .map((o) => `• ${o.allDay ? 'All day' : formatTime(o.scheduledAt, tz)} — ${esc(o.title)}`)
    const text = pending.length
      ? `☀️ <b>Good morning!</b> ${pending.length} reminder${pending.length === 1 ? '' : 's'} today:\n\n${lines.join('\n')}`
      : `☀️ <b>Good morning!</b> Nothing scheduled today — a great day to get ahead.`
    if (await deliver(supabase, u, { kind: 'morning_agenda', dedupeKey: `agenda:${today}`, text })) sent++
  }

  // --- Evening summary -----------------------------------------------------
  if (u.evening_summary && atLocalTime(local, u.evening_summary_time)) {
    const done = occurrences.filter((o) => o.status === 'completed').length
    const skipped = occurrences.filter((o) => o.status === 'skipped').length
    const due = occurrences.length - skipped
    const pct = due > 0 ? Math.round((done / due) * 100) : 100
    const streak = await currentStreak(supabase, u.user_id, today)
    const text =
      `🌙 <b>Evening summary</b>\n` +
      `Completed ${done}/${due} (${pct}%)` +
      (skipped ? ` · ${skipped} skipped` : '') +
      (streak > 0 ? `\n🔥 Streak: ${streak} day${streak === 1 ? '' : 's'}` : '')
    if (await deliver(supabase, u, { kind: 'evening_summary', dedupeKey: `summary:${today}`, text })) sent++
  }

  // --- Weekly progress (18:00 local on the configured day) -----------------
  if (u.weekly_progress && local.dow === u.weekly_progress_day && atLocalTime(local, '18:00')) {
    const { data: stats } = await supabase
      .from('daily_statistics')
      .select('date, due_count, completed_count')
      .eq('user_id', u.user_id)
      .gte('date', addDaysIso(today, -6))
      .lte('date', today)
    const due = (stats ?? []).reduce((s, r) => s + r.due_count, 0)
    const done = (stats ?? []).reduce((s, r) => s + r.completed_count, 0)
    const pct = due > 0 ? Math.round((done / due) * 100) : 100
    const text = `📊 <b>Weekly progress</b>\nCompleted ${done}/${due} reminders (${pct}%) over the last 7 days.`
    if (await deliver(supabase, u, { kind: 'weekly', dedupeKey: `weekly:${today}`, text })) sent++
  }

  return sent
}

interface DueOccurrence {
  reminderId: string
  title: string
  description: string
  scheduledAt: Date
  allDay: boolean
  notify: boolean
  notifyMinutesBefore: number
  status: 'pending' | 'completed' | 'skipped'
}

/**
 * Expand today's occurrences for a user. Mirrors the client engine's
 * semantics: RRULEs recur over calendar DATES; reminder_time supplies the
 * wall-clock time in the reminder's timezone (DST-safe by construction).
 */
async function todaysOccurrences(
  supabase: Supabase,
  userId: string,
  today: string,
  fallbackTz: string
): Promise<DueOccurrence[]> {
  const [{ data: reminders }, { data: overrides }] = await Promise.all([
    supabase
      .from('reminders')
      .select(
        'id, title, description, rrule, timezone, start_date, end_date, reminder_time, all_day, notify, notify_minutes_before'
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .is('archived_at', null)
      .lte('start_date', today),
    supabase
      .from('reminder_occurrences')
      .select('reminder_id, status, snoozed_until, moved_to, deleted_at')
      .eq('user_id', userId)
      .eq('occurrence_date', today),
  ])

  const overrideMap = new Map<string, any>(
    (overrides ?? []).map((o) => [o.reminder_id, o])
  )
  const out: DueOccurrence[] = []

  for (const r of reminders ?? []) {
    if (r.end_date && r.end_date < today) continue
    if (!occursOn(r, today)) continue

    const override = overrideMap.get(r.id)
    if (override?.deleted_at) continue

    const tz = r.timezone || fallbackTz
    let scheduledAt = r.all_day || !r.reminder_time
      ? localToUtc(today, '09:00', tz) // all-day: agenda ordering anchor only
      : localToUtc(today, r.reminder_time, tz)
    if (override?.moved_to) scheduledAt = new Date(override.moved_to)
    if (override?.snoozed_until) scheduledAt = new Date(override.snoozed_until)

    out.push({
      reminderId: r.id,
      title: r.title,
      description: r.description ?? '',
      scheduledAt,
      allDay: !!r.all_day || !r.reminder_time,
      notify: !!r.notify,
      notifyMinutesBefore: r.notify_minutes_before ?? 0,
      status: override?.status ?? 'pending',
    })
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function occursOn(r: any, isoDate: string): boolean {
  if (!r.rrule) return r.start_date === isoDate
  try {
    const dtstart = isoToFloatingUtc(r.start_date)
    const rule = new RRule({ ...RRule.parseString(r.rrule), dtstart })
    const day = isoToFloatingUtc(isoDate)
    const hits = rule.between(day, new Date(day.getTime() + 86_400_000 - 1), true)
    return hits.length > 0
  } catch {
    return false
  }
}

// --- time helpers ------------------------------------------------------------

function isoToFloatingUtc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addDaysIso(iso: string, days: number): string {
  const d = isoToFloatingUtc(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface LocalParts {
  date: string // yyyy-MM-dd
  hh: number
  mm: number
  dow: number // 0 = Sunday
}

function getLocalParts(instant: Date, tz: string): LocalParts {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]))
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hh: Number(parts.hour === '24' ? '00' : parts.hour),
    mm: Number(parts.minute),
    dow: dowMap[parts.weekday] ?? 0,
  }
}

/** Convert a local wall-clock (date + HH:mm in tz) to the UTC instant. */
function localToUtc(isoDate: string, time: string, tz: string): Date {
  const [y, mo, d] = isoDate.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  // First guess: treat local as UTC, then correct by the zone offset at that
  // instant (two-pass handles DST edges).
  let guess = Date.UTC(y, mo - 1, d, hh, mm)
  for (let i = 0; i < 2; i++) {
    const rendered = getLocalParts(new Date(guess), tz)
    const want = Date.UTC(y, mo - 1, d, hh, mm)
    const got = Date.UTC(
      Number(rendered.date.slice(0, 4)),
      Number(rendered.date.slice(5, 7)) - 1,
      Number(rendered.date.slice(8, 10)),
      rendered.hh,
      rendered.mm
    )
    guess += want - got
    if (want === got) break
  }
  return new Date(guess)
}

function formatTime(instant: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant)
}

/** True when `target` is within the (lookback) dispatch window ending at now. */
function inWindow(target: Date, now: Date): boolean {
  const diff = now.getTime() - target.getTime()
  return diff >= 0 && diff < LOOKBACK_MIN * 60_000
}

function atLocalTime(local: LocalParts, hhmm: string): boolean {
  const [hh, mm] = String(hhmm).slice(0, 5).split(':').map(Number)
  const nowMin = local.hh * 60 + local.mm
  const atMin = hh * 60 + mm
  return nowMin >= atMin && nowMin - atMin < LOOKBACK_MIN
}

async function currentStreak(
  supabase: Supabase,
  userId: string,
  today: string
): Promise<number> {
  const { data } = await supabase
    .from('daily_statistics')
    .select('date, due_count, completed_count')
    .eq('user_id', userId)
    .lte('date', today)
    .order('date', { ascending: false })
    .limit(400)
  let streak = 0
  let expect = today
  for (const row of data ?? []) {
    if (row.date !== expect) break
    if (row.due_count > 0 && row.completed_count < row.due_count) break
    if (row.due_count > 0) streak++
    expect = addDaysIso(row.date, -1)
  }
  return streak
}

async function deliver(
  supabase: Supabase,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  u: any,
  msg: { kind: string; dedupeKey: string; text: string }
): Promise<boolean> {
  // Claim the dedupe key first — a unique violation means another run sent it.
  const { error: claimError } = await supabase.from('notification_log').insert({
    user_id: u.user_id,
    kind: msg.kind,
    dedupe_key: msg.dedupeKey,
    ok: false,
    detail: 'claimed',
  })
  if (claimError) return false

  const result = await sendTelegramMessage(u.bot_token, u.chat_id, msg.text)
  await supabase
    .from('notification_log')
    .update({ ok: result.ok, detail: result.detail, sent_at: new Date().toISOString() })
    .eq('user_id', u.user_id)
    .eq('dedupe_key', msg.dedupeKey)
  return result.ok
}

/** Signature is gateway-verified; we only need to check the role claim. */
function isServiceRole(authHeader: string): boolean {
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    )
    return payload?.role === 'service_role'
  } catch {
    return false
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
