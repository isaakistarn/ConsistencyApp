/**
 * Streak & consistency math. Everything derives from daily_statistics rows
 * (one per local date with due work), so all functions are O(days).
 *
 * A day "counts" toward streaks when due_count > 0 and every due item was
 * completed. Days with nothing due are neutral: they neither break nor extend
 * a streak (being idle on a rest day shouldn't punish you).
 */
import type { DailyStatistic } from '@/types'

export interface StreakSummary {
  current: number
  longest: number
  /** ISO date the current streak started, if any */
  currentStart: string | null
}

type DayRow = Pick<DailyStatistic, 'date' | 'due_count' | 'completed_count'>

function isPerfect(row: DayRow): boolean {
  return row.due_count > 0 && row.completed_count >= row.due_count
}

function isBroken(row: DayRow): boolean {
  return row.due_count > 0 && row.completed_count < row.due_count
}

/**
 * Compute streaks from stat rows (any order). `todayIso` marks the boundary:
 * today never *breaks* the current streak while it is still incomplete
 * (the day isn't over yet), but does extend it once perfect.
 */
export function computeStreaks(rows: DayRow[], todayIso: string): StreakSummary {
  const sorted = [...rows]
    .filter((r) => r.date <= todayIso)
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  // Longest: single pass over history.
  let longest = 0
  let run = 0
  for (const row of sorted) {
    if (isPerfect(row)) {
      run++
      if (run > longest) longest = run
    } else if (isBroken(row) && row.date !== todayIso) {
      run = 0
    }
    // Neutral days (due_count 0) leave the run untouched.
  }

  // Current: walk backwards from today.
  let current = 0
  let currentStart: string | null = null
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i]!
    if (isPerfect(row)) {
      current++
      currentStart = row.date
    } else if (isBroken(row)) {
      if (row.date === todayIso) continue // today is still in progress
      break
    }
    // Neutral: keep walking.
  }

  return { current, longest, currentStart }
}

export interface ConsistencyStats {
  totalDue: number
  totalCompleted: number
  totalSkipped: number
  /** 0–100 */
  completionRate: number
  perfectDays: number
  activeDays: number
  perfectWeeks: number
  perfectMonths: number
}

/** Aggregate consistency over a set of stat rows (already range-filtered). */
export function computeConsistency(rows: DayRow[]): ConsistencyStats {
  let totalDue = 0
  let totalCompleted = 0
  let totalSkipped = 0
  let perfectDays = 0
  let activeDays = 0

  const weeks = new Map<string, { due: number; done: number }>()
  const months = new Map<string, { due: number; done: number }>()

  for (const row of rows) {
    if (row.due_count <= 0) continue
    activeDays++
    totalDue += row.due_count
    totalCompleted += Math.min(row.completed_count, row.due_count)
    totalSkipped += (row as DailyStatistic).skipped_count ?? 0
    if (isPerfect(row)) perfectDays++

    const weekKey = isoWeekKey(row.date)
    const monthKey = row.date.slice(0, 7)
    const w = weeks.get(weekKey) ?? { due: 0, done: 0 }
    w.due += row.due_count
    w.done += row.completed_count
    weeks.set(weekKey, w)
    const m = months.get(monthKey) ?? { due: 0, done: 0 }
    m.due += row.due_count
    m.done += row.completed_count
    months.set(monthKey, m)
  }

  const perfectWeeks = [...weeks.values()].filter((w) => w.done >= w.due).length
  const perfectMonths = [...months.values()].filter((m) => m.done >= m.due).length

  return {
    totalDue,
    totalCompleted,
    totalSkipped,
    completionRate: totalDue > 0 ? Math.round((totalCompleted / totalDue) * 100) : 0,
    perfectDays,
    activeDays,
    perfectWeeks,
    perfectMonths,
  }
}

/** ISO-8601 week key, e.g. "2026-W31". */
export function isoWeekKey(isoDate: string): string {
  const [y = 1970, m = 1, d = 1] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  // Shift to the Thursday of this week (ISO week is defined by its Thursday).
  const dow = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dow)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** Heatmap intensity level 0–4 from a day's score (GitHub-style buckets). */
export function heatLevel(row: DayRow | undefined): 0 | 1 | 2 | 3 | 4 {
  if (!row || row.due_count <= 0) return 0
  const score = row.completed_count / row.due_count
  if (score <= 0) return 0
  if (score < 0.34) return 1
  if (score < 0.67) return 2
  if (score < 1) return 3
  return 4
}

/**
 * Build the day-level stat row for one date from resolved occurrences —
 * called after every completion change, then upserted into daily_statistics.
 */
export function buildDailyStat(
  occurrences: { status: string }[],
  date: string
): {
  date: string
  due_count: number
  completed_count: number
  skipped_count: number
  score: number
} {
  const skipped = occurrences.filter((o) => o.status === 'skipped').length
  const completed = occurrences.filter((o) => o.status === 'completed').length
  const due = occurrences.length - skipped
  return {
    date,
    due_count: due,
    completed_count: completed,
    skipped_count: skipped,
    score: due > 0 ? Math.round((completed / due) * 1000) / 1000 : 0,
  }
}
