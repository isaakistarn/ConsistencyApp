import { describe, expect, it } from 'vitest'
import {
  expandReminderDates,
  nextOccurrenceDate,
  occursOn,
  resolveDay,
  resolveOccurrences,
} from '@/lib/recurrence/engine'
import type { Reminder, ReminderOccurrence } from '@/types'

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r1',
    user_id: 'u1',
    title: 'Test',
    description: '',
    priority: 'none',
    category_id: null,
    time_block_id: null,
    color: null,
    rrule: null,
    timezone: 'UTC',
    start_date: '2026-01-05', // a Monday
    end_date: null,
    reminder_time: '09:00',
    duration_minutes: 30,
    all_day: false,
    notify: true,
    notify_minutes_before: 0,
    notes: '',
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

function makeOverride(overrides: Partial<ReminderOccurrence> = {}): ReminderOccurrence {
  return {
    id: 'o1',
    user_id: 'u1',
    reminder_id: 'r1',
    occurrence_date: '2026-01-05',
    scheduled_at: '2026-01-05T09:00:00Z',
    status: 'pending',
    completed_at: null,
    snoozed_until: null,
    moved_to: null,
    duration_minutes: null,
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

describe('expandReminderDates', () => {
  it('returns the single date for one-time reminders inside the window', () => {
    const r = makeReminder()
    expect(expandReminderDates(r, '2026-01-01', '2026-01-31')).toEqual(['2026-01-05'])
    expect(expandReminderDates(r, '2026-01-06', '2026-01-31')).toEqual([])
  })

  it('expands FREQ=DAILY', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    expect(expandReminderDates(r, '2026-01-05', '2026-01-08')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
    ])
  })

  it('expands weekly BYDAY (Mon/Wed/Fri)', () => {
    const r = makeReminder({ rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' })
    expect(expandReminderDates(r, '2026-01-05', '2026-01-11')).toEqual([
      '2026-01-05',
      '2026-01-07',
      '2026-01-09',
    ])
  })

  it('expands every-X-days intervals', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY;INTERVAL=3' })
    expect(expandReminderDates(r, '2026-01-05', '2026-01-15')).toEqual([
      '2026-01-05',
      '2026-01-08',
      '2026-01-11',
      '2026-01-14',
    ])
  })

  it('expands weekdays only', () => {
    const r = makeReminder({ rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' })
    const dates = expandReminderDates(r, '2026-01-05', '2026-01-11')
    // 10th/11th are Sat/Sun
    expect(dates).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
      '2026-01-08',
      '2026-01-09',
    ])
  })

  it('expands monthly on the start day-of-month', () => {
    const r = makeReminder({ rrule: 'FREQ=MONTHLY' })
    expect(expandReminderDates(r, '2026-01-01', '2026-03-31')).toEqual([
      '2026-01-05',
      '2026-02-05',
      '2026-03-05',
    ])
  })

  it('respects end_date clipping', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY', end_date: '2026-01-07' })
    expect(expandReminderDates(r, '2026-01-05', '2026-01-31')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ])
  })

  it('never emits dates before start_date', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    expect(expandReminderDates(r, '2025-12-01', '2026-01-06')).toEqual([
      '2026-01-05',
      '2026-01-06',
    ])
  })

  it('handles COUNT rules', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY;COUNT=3' })
    expect(expandReminderDates(r, '2026-01-01', '2026-01-31')).toEqual([
      '2026-01-05',
      '2026-01-06',
      '2026-01-07',
    ])
  })

  it('returns [] for malformed rrules instead of throwing', () => {
    const r = makeReminder({ rrule: 'FREQ=BANANAS' })
    expect(expandReminderDates(r, '2026-01-01', '2026-01-31')).toEqual([])
  })
})

describe('occursOn / nextOccurrenceDate', () => {
  it('occursOn matches expansion', () => {
    const r = makeReminder({ rrule: 'FREQ=WEEKLY;BYDAY=MO' })
    expect(occursOn(r, '2026-01-12')).toBe(true)
    expect(occursOn(r, '2026-01-13')).toBe(false)
  })

  it('nextOccurrenceDate finds the next hit inclusive of today', () => {
    const r = makeReminder({ rrule: 'FREQ=WEEKLY;BYDAY=MO' })
    expect(nextOccurrenceDate(r, '2026-01-05')).toBe('2026-01-05')
    expect(nextOccurrenceDate(r, '2026-01-06')).toBe('2026-01-12')
  })

  it('nextOccurrenceDate respects end_date', () => {
    const r = makeReminder({ rrule: 'FREQ=WEEKLY;BYDAY=MO', end_date: '2026-01-10' })
    expect(nextOccurrenceDate(r, '2026-01-06')).toBeNull()
  })
})

describe('timezone & DST safety', () => {
  it('resolves wall-clock times in the reminder timezone', () => {
    const r = makeReminder({
      rrule: 'FREQ=DAILY',
      timezone: 'Australia/Sydney',
      reminder_time: '09:00',
    })
    const [occ] = resolveDay([r], [], '2026-01-06')
    // Sydney is UTC+11 in January (AEDT) → 09:00 local = 22:00 UTC previous day
    expect(occ!.scheduled_at.toISOString()).toBe('2026-01-05T22:00:00.000Z')
  })

  it('keeps wall-clock time stable across a DST transition (spring forward)', () => {
    const r = makeReminder({
      rrule: 'FREQ=DAILY',
      timezone: 'Europe/Berlin',
      start_date: '2026-03-28',
      reminder_time: '09:00',
    })
    const occurrences = resolveOccurrences([r], [], '2026-03-28', '2026-03-30')
    // Berlin switches CET (+1) → CEST (+2) on 2026-03-29.
    expect(occurrences.map((o) => o.scheduled_at.toISOString())).toEqual([
      '2026-03-28T08:00:00.000Z', // +1
      '2026-03-29T07:00:00.000Z', // +2
      '2026-03-30T07:00:00.000Z', // +2
    ])
    // Occurrence identity (the local date) is unaffected.
    expect(occurrences.map((o) => o.occurrence_date)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ])
  })

  it('daily recurrence yields exactly one occurrence per local date across DST', () => {
    const r = makeReminder({
      rrule: 'FREQ=DAILY',
      timezone: 'America/New_York',
      start_date: '2026-10-30',
      reminder_time: '01:30', // inside the repeated hour on fall-back day
    })
    const occurrences = resolveOccurrences([r], [], '2026-10-30', '2026-11-03')
    expect(occurrences).toHaveLength(5)
    expect(new Set(occurrences.map((o) => o.occurrence_date)).size).toBe(5)
  })
})

describe('resolveOccurrences override merging', () => {
  it('applies completed overrides', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    const override = makeOverride({
      occurrence_date: '2026-01-06',
      status: 'completed',
      completed_at: '2026-01-06T10:00:00Z',
    })
    const occurrences = resolveOccurrences([r], [override], '2026-01-05', '2026-01-06')
    expect(occurrences.find((o) => o.occurrence_date === '2026-01-06')!.status).toBe(
      'completed'
    )
    expect(occurrences.find((o) => o.occurrence_date === '2026-01-05')!.status).toBe(
      'pending'
    )
  })

  it('hides skipped occurrences unless includeSkipped', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    const override = makeOverride({ occurrence_date: '2026-01-06', status: 'skipped' })
    expect(resolveOccurrences([r], [override], '2026-01-06', '2026-01-06')).toHaveLength(
      0
    )
    expect(
      resolveOccurrences([r], [override], '2026-01-06', '2026-01-06', {
        includeSkipped: true,
      })
    ).toHaveLength(1)
  })

  it('applies moved_to reschedules and duration overrides', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    const override = makeOverride({
      occurrence_date: '2026-01-06',
      moved_to: '2026-01-06T14:30:00Z',
      duration_minutes: 90,
    })
    const [occ] = resolveOccurrences([r], [override], '2026-01-06', '2026-01-06')
    expect(occ!.scheduled_at.toISOString()).toBe('2026-01-06T14:30:00.000Z')
    expect(occ!.duration_minutes).toBe(90)
    expect(occ!.end_at.toISOString()).toBe('2026-01-06T16:00:00.000Z')
  })

  it('pushes pending occurrences forward when snoozed', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    const override = makeOverride({
      occurrence_date: '2026-01-06',
      snoozed_until: '2026-01-06T11:00:00Z',
    })
    const [occ] = resolveOccurrences([r], [override], '2026-01-06', '2026-01-06')
    expect(occ!.scheduled_at.toISOString()).toBe('2026-01-06T11:00:00.000Z')
  })

  it('excludes deleted overrides (per-instance deletion)', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    const override = makeOverride({
      occurrence_date: '2026-01-06',
      deleted_at: '2026-01-06T00:00:00Z',
    })
    expect(resolveOccurrences([r], [override], '2026-01-06', '2026-01-06')).toHaveLength(
      0
    )
  })

  it('skips deleted and archived reminders entirely', () => {
    const deleted = makeReminder({ id: 'r-del', deleted_at: '2026-01-01T00:00:00Z' })
    const archived = makeReminder({ id: 'r-arc', archived_at: '2026-01-01T00:00:00Z' })
    expect(
      resolveOccurrences([deleted, archived], [], '2026-01-05', '2026-01-05')
    ).toHaveLength(0)
  })

  it('flags overdue pending occurrences', () => {
    const r = makeReminder({ rrule: 'FREQ=DAILY' })
    const now = new Date('2026-01-06T12:00:00Z')
    const occurrences = resolveOccurrences([r], [], '2026-01-06', '2026-01-07', { now })
    expect(occurrences.find((o) => o.occurrence_date === '2026-01-06')!.overdue).toBe(
      true
    )
    expect(occurrences.find((o) => o.occurrence_date === '2026-01-07')!.overdue).toBe(
      false
    )
  })

  it('sorts all-day first, then by time', () => {
    const allDay = makeReminder({ id: 'a', all_day: true, reminder_time: null })
    const late = makeReminder({ id: 'b', reminder_time: '18:00' })
    const early = makeReminder({ id: 'c', reminder_time: '07:00' })
    const occurrences = resolveOccurrences(
      [late, allDay, early],
      [],
      '2026-01-05',
      '2026-01-05'
    )
    expect(occurrences.map((o) => o.reminder.id)).toEqual(['a', 'c', 'b'])
  })
})
