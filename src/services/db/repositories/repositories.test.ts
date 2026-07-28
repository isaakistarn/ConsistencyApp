/**
 * Data-layer integration tests over fake-indexeddb: atomic outbox writes,
 * tombstone deletes, occurrence actions and daily-stat recomputation.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/services/db/database'
import { setCurrentUserId } from '@/services/db/repository'
import {
  createReminder,
  deleteReminder,
  duplicateReminder,
  listReminders,
  type ReminderDraft,
} from '@/services/db/repositories/reminders'
import {
  completeOccurrence,
  skipOccurrence,
  snoozeOccurrence,
  undoCompletion,
} from '@/services/db/repositories/occurrences'
import { listAllDailyStats } from '@/services/db/repositories/statistics'
import { todayIso } from '@/lib/dates'

const draft: ReminderDraft = {
  title: 'Test reminder',
  description: '',
  priority: 'none',
  category_id: null,
  time_block_id: null,
  color: null,
  rrule: 'FREQ=DAILY',
  timezone: 'UTC',
  start_date: '2026-01-01',
  end_date: null,
  reminder_time: '09:00',
  duration_minutes: 30,
  all_day: false,
  notify: false,
  notify_minutes_before: 0,
  notes: '',
}

beforeEach(async () => {
  setCurrentUserId('test-user')
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('reminder repository', () => {
  it('creates a reminder and queues an outbox upsert atomically', async () => {
    const reminder = await createReminder(draft)
    expect(reminder.id).toBeTruthy()
    expect(reminder.user_id).toBe('test-user')

    const outbox = await db.outbox.toArray()
    const reminderPushes = outbox.filter((e) => e.table === 'reminders')
    expect(reminderPushes).toHaveLength(1)
    expect(reminderPushes[0]!.op).toBe('upsert')
    expect(reminderPushes[0]!.row_id).toBe(reminder.id)
  })

  it('soft-deletes with a tombstone (row remains, filtered from reads)', async () => {
    const reminder = await createReminder(draft)
    await deleteReminder(reminder.id)

    expect(await listReminders()).toHaveLength(0)
    const raw = await db.reminders.get(reminder.id)
    expect(raw?.deleted_at).toBeTruthy()

    // The tombstone travels through the outbox too.
    const pushes = await db.outbox.toArray()
    const last = pushes.filter((e) => e.table === 'reminders').at(-1)!
    expect((last.payload as { deleted_at: string | null }).deleted_at).toBeTruthy()
  })

  it('duplicates with a fresh id', async () => {
    const original = await createReminder(draft)
    const copy = await duplicateReminder(original.id)
    expect(copy!.id).not.toBe(original.id)
    expect(copy!.title).toContain('(copy)')
    expect(await listReminders()).toHaveLength(2)
  })
})

describe('occurrence actions', () => {
  it('complete → undo round-trips status and logs both actions', async () => {
    const reminder = await createReminder(draft)
    const today = todayIso()

    const completed = await completeOccurrence(reminder, today)
    expect(completed.status).toBe('completed')
    expect(completed.completed_at).toBeTruthy()

    const reopened = await undoCompletion(reminder, today)
    expect(reopened.status).toBe('pending')
    expect(reopened.completed_at).toBeNull()

    // toArray() returns primary-key order (UUIDs), so compare as a set.
    const logs = await db.completion_logs.toArray()
    expect(logs.map((l) => l.action).sort()).toEqual(['completed', 'undone'])
  })

  it('is idempotent per (reminder, date) — one override row, not duplicates', async () => {
    const reminder = await createReminder(draft)
    const today = todayIso()
    await completeOccurrence(reminder, today)
    await undoCompletion(reminder, today)
    await completeOccurrence(reminder, today)
    const overrides = await db.reminder_occurrences.toArray()
    expect(overrides).toHaveLength(1)
  })

  it('recomputes daily statistics after completion changes', async () => {
    const reminder = await createReminder(draft)
    const today = todayIso()
    await completeOccurrence(reminder, today)

    const stats = await listAllDailyStats()
    const todayStat = stats.find((s) => s.date === today)
    expect(todayStat).toBeDefined()
    expect(todayStat!.due_count).toBe(1)
    expect(todayStat!.completed_count).toBe(1)
    expect(todayStat!.score).toBe(1)
  })

  it('skip removes the item from due counts', async () => {
    const reminder = await createReminder(draft)
    const today = todayIso()
    await skipOccurrence(reminder, today)

    const stats = await listAllDailyStats()
    const todayStat = stats.find((s) => s.date === today)!
    expect(todayStat.due_count).toBe(0)
    expect(todayStat.skipped_count).toBe(1)
  })

  it('snooze pushes scheduled time forward without changing status', async () => {
    const reminder = await createReminder(draft)
    const today = todayIso()
    const snoozed = await snoozeOccurrence(reminder, today, 30)
    expect(snoozed.status).toBe('pending')
    expect(new Date(snoozed.snoozed_until!).getTime()).toBeGreaterThan(Date.now())
  })
})
