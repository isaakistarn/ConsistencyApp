import { describe, expect, it } from 'vitest'
import {
  buildDailyStat,
  computeConsistency,
  computeStreaks,
  heatLevel,
  isoWeekKey,
} from '@/lib/streaks'

function day(date: string, due: number, done: number) {
  return { date, due_count: due, completed_count: done }
}

describe('computeStreaks', () => {
  it('counts consecutive perfect days', () => {
    const rows = [
      day('2026-07-25', 3, 3),
      day('2026-07-26', 2, 2),
      day('2026-07-27', 1, 1),
    ]
    const s = computeStreaks(rows, '2026-07-27')
    expect(s.current).toBe(3)
    expect(s.longest).toBe(3)
    expect(s.currentStart).toBe('2026-07-25')
  })

  it('breaks the streak on an incomplete past day', () => {
    const rows = [
      day('2026-07-24', 2, 2),
      day('2026-07-25', 2, 1), // broken
      day('2026-07-26', 2, 2),
      day('2026-07-27', 2, 2),
    ]
    const s = computeStreaks(rows, '2026-07-27')
    expect(s.current).toBe(2)
    expect(s.longest).toBe(2)
  })

  it('treats an unfinished TODAY as in-progress, not broken', () => {
    const rows = [
      day('2026-07-25', 2, 2),
      day('2026-07-26', 2, 2),
      day('2026-07-27', 3, 1), // today, still going
    ]
    const s = computeStreaks(rows, '2026-07-27')
    expect(s.current).toBe(2)
  })

  it('treats days with nothing due as neutral (streak survives rest days)', () => {
    const rows = [
      day('2026-07-24', 2, 2),
      day('2026-07-25', 0, 0), // rest day
      day('2026-07-26', 2, 2),
    ]
    const s = computeStreaks(rows, '2026-07-26')
    expect(s.current).toBe(2)
    expect(s.longest).toBe(2)
  })

  it('tracks the longest streak across history', () => {
    const rows = [
      day('2026-07-01', 1, 1),
      day('2026-07-02', 1, 1),
      day('2026-07-03', 1, 1),
      day('2026-07-04', 1, 0),
      day('2026-07-05', 1, 1),
    ]
    const s = computeStreaks(rows, '2026-07-05')
    expect(s.longest).toBe(3)
    expect(s.current).toBe(1)
  })

  it('handles empty input', () => {
    expect(computeStreaks([], '2026-07-27')).toEqual({
      current: 0,
      longest: 0,
      currentStart: null,
    })
  })
})

describe('computeConsistency', () => {
  it('aggregates totals, perfect days/weeks', () => {
    const rows = [
      // ISO week 2026-W05: Mon 26 Jan – Sun 1 Feb
      day('2026-01-26', 2, 2),
      day('2026-01-27', 2, 2),
      day('2026-01-28', 1, 0),
      // fully complete week
      day('2026-02-02', 1, 1),
      day('2026-02-03', 1, 1),
    ]
    const c = computeConsistency(rows)
    expect(c.totalDue).toBe(7)
    expect(c.totalCompleted).toBe(6)
    expect(c.completionRate).toBe(86)
    expect(c.perfectDays).toBe(4)
    expect(c.activeDays).toBe(5)
    expect(c.perfectWeeks).toBe(1)
  })
})

describe('isoWeekKey', () => {
  it('computes ISO week numbers', () => {
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2026-07-27')).toBe('2026-W31')
    // Jan 1 2027 is a Friday → belongs to 2026-W53
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53')
  })
})

describe('heatLevel', () => {
  it('buckets scores GitHub-style', () => {
    expect(heatLevel(undefined)).toBe(0)
    expect(heatLevel(day('d', 0, 0))).toBe(0)
    expect(heatLevel(day('d', 10, 0))).toBe(0)
    expect(heatLevel(day('d', 10, 3))).toBe(1)
    expect(heatLevel(day('d', 10, 5))).toBe(2)
    expect(heatLevel(day('d', 10, 9))).toBe(3)
    expect(heatLevel(day('d', 10, 10))).toBe(4)
  })
})

describe('buildDailyStat', () => {
  it('excludes skipped from due and computes score', () => {
    const stat = buildDailyStat(
      [
        { status: 'completed' },
        { status: 'completed' },
        { status: 'pending' },
        { status: 'skipped' },
      ],
      '2026-07-27'
    )
    expect(stat).toEqual({
      date: '2026-07-27',
      due_count: 3,
      completed_count: 2,
      skipped_count: 1,
      score: 0.667,
    })
  })

  it('scores an empty day as 0 with no due', () => {
    expect(buildDailyStat([], '2026-07-27').due_count).toBe(0)
  })
})
