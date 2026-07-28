import { db } from '@/services/db/database'
import { getCurrentUserId, upsertRow } from '@/services/db/repository'
import { deviceTimeZone } from '@/lib/dates'
import { nowIso } from '@/lib/utils'
import type { Profile, TelegramSettings, UserPreferences } from '@/types'

export function defaultPreferences(userId: string): UserPreferences {
  return {
    user_id: userId,
    theme: 'system',
    accent_color: 'emerald',
    week_starts_on: 1,
    default_calendar_view: 'timeGridWeek',
    default_duration_min: 30,
    time_format: '24h',
    day_start_hour: 6,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

export async function getPreferences(): Promise<UserPreferences> {
  const userId = getCurrentUserId()
  return (await db.user_preferences.get(userId)) ?? defaultPreferences(userId)
}

export async function updatePreferences(
  patch: Partial<UserPreferences>
): Promise<UserPreferences> {
  const current = await getPreferences()
  return upsertRow('user_preferences', { ...current, ...patch })
}

export async function getProfile(): Promise<Profile | undefined> {
  return db.profiles.get(getCurrentUserId())
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const userId = getCurrentUserId()
  const current: Profile = (await db.profiles.get(userId)) ?? {
    id: userId,
    display_name: '',
    avatar_url: null,
    timezone: deviceTimeZone(),
    created_at: nowIso(),
    updated_at: nowIso(),
  }
  return upsertRow('profiles', { ...current, ...patch })
}

export function defaultTelegramSettings(userId: string): TelegramSettings {
  return {
    user_id: userId,
    bot_token: '',
    chat_id: '',
    enabled: false,
    notify_reminders: true,
    notify_completions: false,
    notify_missed: true,
    morning_agenda: false,
    morning_agenda_time: '07:30',
    evening_summary: false,
    evening_summary_time: '21:00',
    weekly_progress: false,
    weekly_progress_day: 0,
    last_test_at: null,
    last_test_ok: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }
}

export async function getTelegramSettings(): Promise<TelegramSettings> {
  const userId = getCurrentUserId()
  return (await db.telegram_settings.get(userId)) ?? defaultTelegramSettings(userId)
}

export async function updateTelegramSettings(
  patch: Partial<TelegramSettings>
): Promise<TelegramSettings> {
  const current = await getTelegramSettings()
  return upsertRow('telegram_settings', { ...current, ...patch })
}
