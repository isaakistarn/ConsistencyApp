import { db } from '@/services/db/database'
import { getCurrentUserId, notDeleted, upsertRow } from '@/services/db/repository'
import { resolveDay } from '@/lib/recurrence/engine'
import { buildDailyStat } from '@/lib/streaks'
import { newId, nowIso } from '@/lib/utils'
import type { DailyStatistic } from '@/types'

export async function listDailyStats(
  fromIso: string,
  toIso: string
): Promise<DailyStatistic[]> {
  const rows = await db.daily_statistics
    .where('date')
    .between(fromIso, toIso, true, true)
    .toArray()
  return notDeleted(rows)
}

export async function listAllDailyStats(): Promise<DailyStatistic[]> {
  return notDeleted(await db.daily_statistics.toArray())
}

/**
 * Recompute + upsert the daily_statistics row for each date from the current
 * local state. Called after every completion change and schedule edit; each
 * date is O(reminders), so this stays cheap.
 */
export async function recomputeDailyStats(dates: string[]): Promise<void> {
  if (dates.length === 0) return
  const reminders = notDeleted(await db.reminders.toArray())

  for (const date of dates) {
    const overrides = await db.reminder_occurrences
      .where('occurrence_date')
      .equals(date)
      .toArray()
    const occurrences = resolveDay(reminders, overrides, date, {
      includeSkipped: true,
    })
    const stat = buildDailyStat(occurrences, date)

    const existing = (
      await db.daily_statistics.where('date').equals(date).toArray()
    ).find((r) => !r.deleted_at)

    // Nothing due and no row: skip creating noise rows.
    if (!existing && stat.due_count === 0 && stat.skipped_count === 0) continue

    const row: DailyStatistic = {
      id: existing?.id ?? newId(),
      user_id: existing?.user_id ?? getCurrentUserId(),
      created_at: existing?.created_at ?? nowIso(),
      updated_at: nowIso(),
      deleted_at: null,
      ...stat,
    }
    await upsertRow('daily_statistics', row)
  }
}
