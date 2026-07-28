/**
 * Domain types. Field names intentionally mirror the database rows
 * (snake_case): the same object shape flows Dexie ⇄ Supabase ⇄ UI with no
 * mapping layer, which removes a whole class of sync bugs.
 */

export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type OccurrenceStatus = 'pending' | 'completed' | 'skipped'
export type CompletionAction =
  'completed' | 'undone' | 'skipped' | 'unskipped' | 'snoozed' | 'rescheduled'
export type Theme = 'light' | 'dark' | 'system'
export type TimeFormat = '12h' | '24h'
export type CalendarView = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'

/** Fields shared by every syncable row. */
export interface SyncableRow {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  timezone: string
  created_at: string
  updated_at: string
}

export interface UserPreferences {
  user_id: string
  theme: Theme
  accent_color: string
  week_starts_on: number
  default_calendar_view: CalendarView
  default_duration_min: number
  time_format: TimeFormat
  day_start_hour: number
  created_at: string
  updated_at: string
}

export interface Category extends SyncableRow {
  name: string
  color: string
  icon: string
  sort_order: number
}

export interface TimeBlock extends SyncableRow {
  name: string
  description: string
  icon: string
  color: string
  /** HH:mm:ss (or HH:mm) local wall-clock */
  start_time: string
  end_time: string
  /** 0 = Sunday … 6 = Saturday */
  days_of_week: number[]
  sort_order: number
}

export interface Reminder extends SyncableRow {
  title: string
  description: string
  priority: Priority
  category_id: string | null
  time_block_id: string | null
  color: string | null
  /** RFC 5545 RRULE body (no DTSTART line); null = one-time reminder */
  rrule: string | null
  /** IANA timezone the schedule is anchored in */
  timezone: string
  /** Local calendar date of the first occurrence (yyyy-MM-dd) */
  start_date: string
  /** Recurrence window end (inclusive, local date) */
  end_date: string | null
  /** Local wall-clock time HH:mm(:ss); null = all-day */
  reminder_time: string | null
  duration_minutes: number
  all_day: boolean
  notify: boolean
  notify_minutes_before: number
  notes: string
  archived_at: string | null
}

export interface ReminderOccurrence extends SyncableRow {
  reminder_id: string
  /** Local calendar date identifying this instance (yyyy-MM-dd) */
  occurrence_date: string
  /** Resolved UTC instant of the instance */
  scheduled_at: string
  status: OccurrenceStatus
  completed_at: string | null
  snoozed_until: string | null
  /** Per-instance reschedule (calendar drag) */
  moved_to: string | null
  /** Per-instance duration override (calendar resize) */
  duration_minutes: number | null
  notes: string
}

export interface CompletionLog extends SyncableRow {
  reminder_id: string
  occurrence_date: string
  action: CompletionAction
  acted_at: string
}

export interface DailyStatistic extends SyncableRow {
  date: string
  due_count: number
  completed_count: number
  skipped_count: number
  /** 0–1 completion score for the day */
  score: number
}

export interface TelegramSettings {
  user_id: string
  bot_token: string
  chat_id: string
  enabled: boolean
  notify_reminders: boolean
  notify_completions: boolean
  notify_missed: boolean
  morning_agenda: boolean
  morning_agenda_time: string
  evening_summary: boolean
  evening_summary_time: string
  weekly_progress: boolean
  weekly_progress_day: number
  last_test_at: string | null
  last_test_ok: boolean | null
  created_at: string
  updated_at: string
}

export interface ActivityLog extends SyncableRow {
  type: string
  message: string
  metadata: Record<string, unknown>
}

/**
 * A reminder instance resolved for display: the virtual expansion of a
 * reminder on a specific date, merged with its materialized override (if any).
 * This is what the dashboard, calendar and lists render.
 */
export interface ResolvedOccurrence {
  /** `${reminder_id}:${occurrence_date}` — stable list/calendar key */
  key: string
  reminder: Reminder
  occurrence_date: string
  /** UTC instant the instance is scheduled at (after moves/snoozes) */
  scheduled_at: Date
  /** End instant (scheduled_at + effective duration) */
  end_at: Date
  all_day: boolean
  status: OccurrenceStatus
  completed_at: string | null
  snoozed_until: string | null
  duration_minutes: number
  /** The materialized override row, when one exists */
  override: ReminderOccurrence | null
  /** True when scheduled_at is in the past and status is still pending */
  overdue: boolean
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error'

export interface OutboxEntry {
  seq?: number
  table: SyncTable
  op: 'upsert' | 'delete'
  row_id: string
  payload: Record<string, unknown>
  queued_at: string
  attempts: number
  last_error?: string
}

export type SyncTable =
  | 'categories'
  | 'time_blocks'
  | 'reminders'
  | 'reminder_occurrences'
  | 'completion_logs'
  | 'daily_statistics'
  | 'activity_logs'
  | 'user_preferences'
  | 'telegram_settings'
  | 'profiles'
