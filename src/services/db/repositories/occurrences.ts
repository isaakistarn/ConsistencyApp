/**
 * Occurrence actions — the "reminder engine" write side. Completing, skipping,
 * snoozing or moving an instance materializes (or updates) its override row,
 * appends an audit log entry, and recomputes that day's statistics.
 */
import { db } from '@/services/db/database'
import { getCurrentUserId, notDeleted, upsertRow } from '@/services/db/repository'
import { logActivity } from '@/services/db/repositories/activity'
import { recomputeDailyStats } from '@/services/db/repositories/statistics'
import { localClockToUtc } from '@/lib/dates'
import { newId, nowIso } from '@/lib/utils'
import type { CompletionAction, Reminder, ReminderOccurrence } from '@/types'

export async function listOccurrences(
  fromIso: string,
  toIso: string
): Promise<ReminderOccurrence[]> {
  const rows = await db.reminder_occurrences
    .where('occurrence_date')
    .between(fromIso, toIso, true, true)
    .toArray()
  return notDeleted(rows)
}

async function getOrCreateOverride(
  reminder: Reminder,
  occurrenceDate: string
): Promise<ReminderOccurrence> {
  const existing = await db.reminder_occurrences
    .where('[reminder_id+occurrence_date]')
    .equals([reminder.id, occurrenceDate])
    .first()
  if (existing && !existing.deleted_at) return existing

  const scheduledAt = localClockToUtc(
    occurrenceDate,
    reminder.all_day ? null : reminder.reminder_time,
    reminder.timezone
  )
  return {
    id: existing?.id ?? newId(),
    user_id: getCurrentUserId(),
    reminder_id: reminder.id,
    occurrence_date: occurrenceDate,
    scheduled_at: scheduledAt.toISOString(),
    status: 'pending',
    completed_at: null,
    snoozed_until: null,
    moved_to: null,
    duration_minutes: null,
    notes: '',
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  }
}

async function saveAndLog(
  reminder: Reminder,
  override: ReminderOccurrence,
  action: CompletionAction,
  message: string
): Promise<ReminderOccurrence> {
  const saved = await upsertRow('reminder_occurrences', override)
  await upsertRow('completion_logs', {
    id: newId(),
    user_id: getCurrentUserId(),
    reminder_id: reminder.id,
    occurrence_date: override.occurrence_date,
    action,
    acted_at: nowIso(),
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  })
  await logActivity(action, message, {
    reminder_id: reminder.id,
    occurrence_date: override.occurrence_date,
  })
  await recomputeDailyStats([override.occurrence_date])
  return saved
}

export async function completeOccurrence(
  reminder: Reminder,
  occurrenceDate: string
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  return saveAndLog(
    reminder,
    { ...override, status: 'completed', completed_at: nowIso(), snoozed_until: null },
    'completed',
    `Completed “${reminder.title}”`
  )
}

export async function undoCompletion(
  reminder: Reminder,
  occurrenceDate: string
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  return saveAndLog(
    reminder,
    { ...override, status: 'pending', completed_at: null },
    'undone',
    `Reopened “${reminder.title}”`
  )
}

export async function skipOccurrence(
  reminder: Reminder,
  occurrenceDate: string
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  return saveAndLog(
    reminder,
    { ...override, status: 'skipped', completed_at: null },
    'skipped',
    `Skipped “${reminder.title}”`
  )
}

export async function unskipOccurrence(
  reminder: Reminder,
  occurrenceDate: string
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  return saveAndLog(
    reminder,
    { ...override, status: 'pending' },
    'unskipped',
    `Restored “${reminder.title}”`
  )
}

export async function snoozeOccurrence(
  reminder: Reminder,
  occurrenceDate: string,
  minutes: number
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  const base = override.moved_to ?? override.scheduled_at
  const from = Math.max(Date.now(), new Date(base).getTime())
  const until = new Date(from + minutes * 60_000)
  return saveAndLog(
    reminder,
    { ...override, snoozed_until: until.toISOString() },
    'snoozed',
    `Snoozed “${reminder.title}”`
  )
}

/** Calendar drag: reschedule one instance to a new instant. */
export async function moveOccurrence(
  reminder: Reminder,
  occurrenceDate: string,
  newStart: Date,
  newDurationMinutes?: number
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  return saveAndLog(
    reminder,
    {
      ...override,
      moved_to: newStart.toISOString(),
      snoozed_until: null,
      duration_minutes: newDurationMinutes ?? override.duration_minutes,
    },
    'rescheduled',
    `Rescheduled “${reminder.title}”`
  )
}

export async function setOccurrenceNotes(
  reminder: Reminder,
  occurrenceDate: string,
  notes: string
): Promise<ReminderOccurrence> {
  const override = await getOrCreateOverride(reminder, occurrenceDate)
  const saved = await upsertRow('reminder_occurrences', { ...override, notes })
  return saved
}
