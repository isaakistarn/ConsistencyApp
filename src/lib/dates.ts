/**
 * Date helpers. Core principle: an occurrence is identified by its LOCAL
 * calendar date (yyyy-MM-dd) in the reminder's timezone. Wall-clock times are
 * resolved to UTC instants per-date via date-fns-tz, which makes every
 * computation DST-safe (times shift with the zone; dates never do).
 */
import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  parseISO,
  startOfDay,
} from 'date-fns'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'

export const ISO_DATE = 'yyyy-MM-dd'

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

/** Today's local calendar date in the given (or device) timezone. */
export function todayIso(tz?: string): string {
  return formatInTimeZone(new Date(), tz ?? deviceTimeZone(), ISO_DATE)
}

/** yyyy-MM-dd for any Date in device-local time. */
export function toIsoDate(d: Date): string {
  return format(d, ISO_DATE)
}

export function addDaysIso(iso: string, days: number): string {
  return toIsoDate(addDays(parseISO(iso), days))
}

/**
 * Resolve a local wall-clock (date + HH:mm in an IANA zone) to its UTC
 * instant. `fromZonedTime` handles DST gaps/overlaps correctly.
 */
export function localClockToUtc(isoDate: string, time: string | null, tz: string): Date {
  const clock = time ? time.slice(0, 5) : '00:00'
  return fromZonedTime(`${isoDate}T${clock}:00`, tz)
}

/** Parse a floating date (yyyy-MM-dd) as UTC midnight — rrule's expected shape. */
export function isoDateToFloatingUtc(iso: string): Date {
  const [y = 1970, m = 1, d = 1] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Render an rrule "floating UTC" result back to yyyy-MM-dd. */
export function floatingUtcToIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** "Today", "Tomorrow", "Yesterday" or a formatted date. */
export function humanDate(iso: string): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isTomorrow(d)) return 'Tomorrow'
  if (isYesterday(d)) return 'Yesterday'
  const days = differenceInCalendarDays(d, new Date())
  if (days > 0 && days < 7) return format(d, 'EEEE')
  return format(d, 'EEE, d MMM')
}

export function formatClock(date: Date, timeFormat: '12h' | '24h'): string {
  return format(date, timeFormat === '12h' ? 'h:mm a' : 'HH:mm')
}

/** HH:mm from a stored time string (HH:mm or HH:mm:ss). */
export function clockOf(time: string): string {
  return time.slice(0, 5)
}

export function minutesOfDay(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number)
  return h * 60 + m
}

export {
  addDays,
  differenceInCalendarDays,
  format,
  isSameDay,
  isToday,
  parseISO,
  startOfDay,
}
