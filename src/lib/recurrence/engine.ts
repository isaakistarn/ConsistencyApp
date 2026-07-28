/**
 * Recurrence engine — the heart of the app.
 *
 * Design: RRULEs recur over calendar DATES (floating, no time component);
 * the reminder's `reminder_time` supplies the wall-clock time which is
 * resolved to a UTC instant per-date in the reminder's timezone. This makes
 * recurrence immune to DST bugs by construction: "every day at 07:00" stays
 * 07:00 local across transitions, and occurrence identity (the local date)
 * never shifts.
 *
 * Occurrences are expanded virtually for any window; a materialized
 * `ReminderOccurrence` row (created on complete/skip/snooze/move) overrides
 * the virtual instance.
 */
import { RRule } from 'rrule'
import type { Reminder, ReminderOccurrence, ResolvedOccurrence } from '@/types'
import { floatingUtcToIsoDate, isoDateToFloatingUtc, localClockToUtc } from '@/lib/dates'

/** Hard cap on instances expanded per reminder per window (safety valve). */
const MAX_INSTANCES_PER_WINDOW = 740

const ruleCache = new Map<string, RRule>()

function ruleFor(reminder: Reminder): RRule | null {
  if (!reminder.rrule) return null
  const cacheKey = `${reminder.rrule}|${reminder.start_date}`
  let rule = ruleCache.get(cacheKey)
  if (!rule) {
    try {
      rule = new RRule({
        ...RRule.parseString(reminder.rrule),
        dtstart: isoDateToFloatingUtc(reminder.start_date),
      })
    } catch {
      return null
    }
    if (ruleCache.size > 500) ruleCache.clear()
    ruleCache.set(cacheKey, rule)
  }
  return rule
}

/**
 * All local dates (yyyy-MM-dd) on which `reminder` occurs within
 * [fromIso, toIso] inclusive.
 */
export function expandReminderDates(
  reminder: Reminder,
  fromIso: string,
  toIso: string
): string[] {
  // Clip the window to the reminder's own validity range.
  const lo = reminder.start_date > fromIso ? reminder.start_date : fromIso
  const hi = reminder.end_date && reminder.end_date < toIso ? reminder.end_date : toIso
  if (lo > hi) return []

  if (!reminder.rrule) {
    return reminder.start_date >= lo && reminder.start_date <= hi
      ? [reminder.start_date]
      : []
  }

  const rule = ruleFor(reminder)
  if (!rule) return []

  const start = isoDateToFloatingUtc(lo)
  const end = new Date(isoDateToFloatingUtc(hi).getTime() + 86_400_000 - 1)
  const hits = rule.between(start, end, true)
  return hits.slice(0, MAX_INSTANCES_PER_WINDOW).map(floatingUtcToIsoDate)
}

/** Does the reminder occur on this local date? */
export function occursOn(reminder: Reminder, isoDate: string): boolean {
  return expandReminderDates(reminder, isoDate, isoDate).length > 0
}

/** The next occurrence date on or after `fromIso`, or null. */
export function nextOccurrenceDate(reminder: Reminder, fromIso: string): string | null {
  if (!reminder.rrule) {
    return reminder.start_date >= fromIso &&
      (!reminder.end_date || reminder.start_date <= reminder.end_date)
      ? reminder.start_date
      : null
  }
  const rule = ruleFor(reminder)
  if (!rule) return null
  const hit = rule.after(new Date(isoDateToFloatingUtc(fromIso).getTime() - 1), true)
  if (!hit) return null
  const iso = floatingUtcToIsoDate(hit)
  if (reminder.end_date && iso > reminder.end_date) return null
  return iso
}

export interface ResolveOptions {
  /** UTC "now" used for overdue computation. Defaults to new Date(). */
  now?: Date
  /** Include skipped occurrences (calendar shows them dimmed; dashboard hides). */
  includeSkipped?: boolean
}

/**
 * Expand + merge: produce the display-ready occurrence list for a window.
 * `overrides` are the materialized rows for the same window (any order).
 */
export function resolveOccurrences(
  reminders: Reminder[],
  overrides: ReminderOccurrence[],
  fromIso: string,
  toIso: string,
  options: ResolveOptions = {}
): ResolvedOccurrence[] {
  const now = options.now ?? new Date()
  const overrideMap = new Map<string, ReminderOccurrence>()
  for (const o of overrides) {
    overrideMap.set(`${o.reminder_id}:${o.occurrence_date}`, o)
  }

  const out: ResolvedOccurrence[] = []

  for (const reminder of reminders) {
    if (reminder.deleted_at || reminder.archived_at) continue
    for (const date of expandReminderDates(reminder, fromIso, toIso)) {
      const key = `${reminder.id}:${date}`
      const override = overrideMap.get(key) ?? null
      if (override?.deleted_at) continue

      const status = override?.status ?? 'pending'
      if (status === 'skipped' && !options.includeSkipped) continue

      const allDay = reminder.all_day || !reminder.reminder_time
      let scheduledAt = allDay
        ? localClockToUtc(date, null, reminder.timezone)
        : localClockToUtc(date, reminder.reminder_time, reminder.timezone)
      if (override?.moved_to) scheduledAt = new Date(override.moved_to)
      if (override?.snoozed_until && status === 'pending') {
        const snooze = new Date(override.snoozed_until)
        if (snooze > scheduledAt) scheduledAt = snooze
      }

      const duration = override?.duration_minutes ?? reminder.duration_minutes ?? 30

      out.push({
        key,
        reminder,
        occurrence_date: date,
        scheduled_at: scheduledAt,
        end_at: new Date(scheduledAt.getTime() + duration * 60_000),
        all_day: allDay,
        status,
        completed_at: override?.completed_at ?? null,
        snoozed_until: override?.snoozed_until ?? null,
        duration_minutes: duration,
        override,
        overdue: status === 'pending' && !allDay && scheduledAt < now,
      })
    }
  }

  out.sort((a, b) => {
    if (a.all_day !== b.all_day) return a.all_day ? -1 : 1
    return a.scheduled_at.getTime() - b.scheduled_at.getTime()
  })
  return out
}

/** Occurrences due on one date — the everyday query. */
export function resolveDay(
  reminders: Reminder[],
  overrides: ReminderOccurrence[],
  isoDate: string,
  options: ResolveOptions = {}
): ResolvedOccurrence[] {
  return resolveOccurrences(reminders, overrides, isoDate, isoDate, options)
}
