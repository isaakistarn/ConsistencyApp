import { db } from '@/services/db/database'
import {
  getCurrentUserId,
  notDeleted,
  softDeleteRow,
  upsertRow,
} from '@/services/db/repository'
import { logActivity } from '@/services/db/repositories/activity'
import { recomputeDailyStats } from '@/services/db/repositories/statistics'
import { expandReminderDates } from '@/lib/recurrence/engine'
import { newId, nowIso } from '@/lib/utils'
import { addDaysIso, todayIso } from '@/lib/dates'
import type { Reminder } from '@/types'

export type ReminderDraft = Omit<
  Reminder,
  'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'archived_at'
>

export async function listReminders(): Promise<Reminder[]> {
  return notDeleted(await db.reminders.toArray())
}

export async function getReminder(id: string): Promise<Reminder | undefined> {
  const r = await db.reminders.get(id)
  return r && !r.deleted_at ? r : undefined
}

export async function createReminder(draft: ReminderDraft): Promise<Reminder> {
  const reminder: Reminder = {
    ...draft,
    id: newId(),
    user_id: getCurrentUserId(),
    archived_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
  }
  await upsertRow('reminders', reminder)
  await logActivity('reminder_created', `Created “${reminder.title}”`, {
    reminder_id: reminder.id,
  })
  await recomputeStatsAround(reminder)
  return reminder
}

export async function updateReminder(
  id: string,
  patch: Partial<ReminderDraft>
): Promise<Reminder | undefined> {
  const existing = await getReminder(id)
  if (!existing) return undefined
  const updated = await upsertRow('reminders', { ...existing, ...patch })
  await recomputeStatsAround(updated)
  return updated
}

export async function deleteReminder(id: string): Promise<void> {
  const existing = await getReminder(id)
  await softDeleteRow('reminders', id)
  // Tombstone the reminder's occurrence overrides too.
  const overrides = await db.reminder_occurrences
    .where('reminder_id')
    .equals(id)
    .toArray()
  for (const o of overrides) {
    if (!o.deleted_at) await softDeleteRow('reminder_occurrences', o.id)
  }
  if (existing) {
    await logActivity('reminder_deleted', `Deleted “${existing.title}”`, {
      reminder_id: id,
    })
    await recomputeStatsAround(existing)
  }
}

export async function duplicateReminder(id: string): Promise<Reminder | undefined> {
  const existing = await getReminder(id)
  if (!existing) return undefined
  const copy: Reminder = {
    ...existing,
    id: newId(),
    title: `${existing.title} (copy)`,
    created_at: nowIso(),
    updated_at: nowIso(),
    deleted_at: null,
    archived_at: null,
  }
  await upsertRow('reminders', copy)
  await recomputeStatsAround(copy)
  return copy
}

export async function setReminderArchived(id: string, archived: boolean): Promise<void> {
  const existing = await getReminder(id)
  if (!existing) return
  const updated = await upsertRow('reminders', {
    ...existing,
    archived_at: archived ? nowIso() : null,
  })
  await recomputeStatsAround(updated)
}

/**
 * Schedule changes ripple into day-level stats. Recompute a window around
 * today big enough to cover anything the dashboard/heatmap shows live.
 */
async function recomputeStatsAround(reminder: Reminder): Promise<void> {
  const today = todayIso()
  const from = addDaysIso(today, -7)
  const dates = new Set(expandReminderDates(reminder, from, today))
  // A schedule edit can also REMOVE occurrences: recompute the recent window.
  for (let i = -7; i <= 0; i++) dates.add(addDaysIso(today, i))
  await recomputeDailyStats([...dates])
}
