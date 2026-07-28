/**
 * Recurrence presets — the bridge between the reminder form's friendly
 * options and RFC 5545 RRULE strings.
 */
import { RRule, type Weekday } from 'rrule'

export type RecurrenceKind =
  | 'once'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'every_x_days'
  | 'every_x_weeks'
  | 'custom'

export interface RecurrenceConfig {
  kind: RecurrenceKind
  /** For every_x_days / every_x_weeks */
  interval?: number
  /** For weekly / every_x_weeks: 0 = Sunday … 6 = Saturday */
  byWeekday?: number[]
  /** For custom: a raw RRULE body */
  customRule?: string
}

const WEEKDAYS: Weekday[] = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
]

/** Build the RRULE body (no DTSTART) for a config; null for one-time. */
export function buildRRule(config: RecurrenceConfig): string | null {
  switch (config.kind) {
    case 'once':
      return null
    case 'daily':
      return 'FREQ=DAILY'
    case 'weekdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'
    case 'weekly': {
      const days = (config.byWeekday ?? [])
        .map((d) => WEEKDAYS[d])
        .filter((w): w is Weekday => w !== undefined)
      return new RRule({
        freq: RRule.WEEKLY,
        byweekday: days.length ? days : undefined,
      })
        .toString()
        .replace(/^RRULE:/, '')
    }
    case 'monthly':
      return 'FREQ=MONTHLY'
    case 'yearly':
      return 'FREQ=YEARLY'
    case 'every_x_days':
      return `FREQ=DAILY;INTERVAL=${Math.max(1, config.interval ?? 2)}`
    case 'every_x_weeks': {
      const days = (config.byWeekday ?? [])
        .map((d) => WEEKDAYS[d])
        .filter((w): w is Weekday => w !== undefined)
      return new RRule({
        freq: RRule.WEEKLY,
        interval: Math.max(1, config.interval ?? 2),
        byweekday: days.length ? days : undefined,
      })
        .toString()
        .replace(/^RRULE:/, '')
    }
    case 'custom': {
      const raw = (config.customRule ?? '').trim().replace(/^RRULE:/i, '')
      if (!raw) return null
      RRule.parseString(raw) // throws on invalid input — caller validates
      return raw
    }
  }
}

/** Best-effort inverse: classify a stored RRULE back into a form config. */
export function parseToConfig(rrule: string | null): RecurrenceConfig {
  if (!rrule) return { kind: 'once' }
  try {
    const opts = RRule.parseString(rrule)
    const byweekday = normalizeWeekdays(opts.byweekday)
    const interval = opts.interval ?? 1

    if (opts.freq === RRule.DAILY && interval === 1) return { kind: 'daily' }
    if (opts.freq === RRule.DAILY) return { kind: 'every_x_days', interval }
    if (opts.freq === RRule.WEEKLY) {
      if (
        interval === 1 &&
        byweekday.length === 5 &&
        [1, 2, 3, 4, 5].every((d) => byweekday.includes(d))
      ) {
        return { kind: 'weekdays' }
      }
      if (interval === 1) return { kind: 'weekly', byWeekday: byweekday }
      return { kind: 'every_x_weeks', interval, byWeekday: byweekday }
    }
    if (opts.freq === RRule.MONTHLY && interval === 1 && !opts.bymonthday) {
      return { kind: 'monthly' }
    }
    if (opts.freq === RRule.YEARLY && interval === 1) return { kind: 'yearly' }
    return { kind: 'custom', customRule: rrule }
  } catch {
    return { kind: 'custom', customRule: rrule ?? '' }
  }
}

function normalizeWeekdays(byweekday: unknown): number[] {
  if (byweekday == null) return []
  const list = Array.isArray(byweekday) ? byweekday : [byweekday]
  return list
    .map((w) => {
      // rrule weekday: 0 = Monday … 6 = Sunday; ours: 0 = Sunday … 6 = Saturday
      const wd = typeof w === 'number' ? w : (w as Weekday).weekday
      return (wd + 1) % 7
    })
    .sort((a, b) => a - b)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Human-readable description, e.g. "Every 2 weeks on Mon, Wed". */
export function describeRecurrence(rrule: string | null): string {
  if (!rrule) return 'Once'
  const config = parseToConfig(rrule)
  switch (config.kind) {
    case 'once':
      return 'Once'
    case 'daily':
      return 'Daily'
    case 'weekdays':
      return 'Every weekday'
    case 'weekly': {
      const days = (config.byWeekday ?? []).map((d) => DAY_NAMES[d]).join(', ')
      return days ? `Weekly on ${days}` : 'Weekly'
    }
    case 'monthly':
      return 'Monthly'
    case 'yearly':
      return 'Yearly'
    case 'every_x_days':
      return `Every ${config.interval} days`
    case 'every_x_weeks': {
      const days = (config.byWeekday ?? []).map((d) => DAY_NAMES[d]).join(', ')
      return `Every ${config.interval} weeks${days ? ` on ${days}` : ''}`
    }
    case 'custom': {
      try {
        const text = RRule.fromString(`RRULE:${rrule.replace(/^RRULE:/i, '')}`).toText()
        return text.charAt(0).toUpperCase() + text.slice(1)
      } catch {
        return 'Custom'
      }
    }
  }
}
