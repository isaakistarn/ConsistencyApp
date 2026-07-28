/**
 * Local-first store. Dexie (IndexedDB) is the ONLY store the UI reads from or
 * writes to; the sync engine reconciles it with Supabase in the background.
 */
import Dexie, { type EntityTable } from 'dexie'
import type {
  ActivityLog,
  Category,
  CompletionLog,
  DailyStatistic,
  OutboxEntry,
  Profile,
  Reminder,
  ReminderOccurrence,
  TelegramSettings,
  TimeBlock,
  UserPreferences,
} from '@/types'

interface MetaEntry {
  key: string
  value: string
}

export class ConsistencyDB extends Dexie {
  categories!: EntityTable<Category, 'id'>
  time_blocks!: EntityTable<TimeBlock, 'id'>
  reminders!: EntityTable<Reminder, 'id'>
  reminder_occurrences!: EntityTable<ReminderOccurrence, 'id'>
  completion_logs!: EntityTable<CompletionLog, 'id'>
  daily_statistics!: EntityTable<DailyStatistic, 'id'>
  activity_logs!: EntityTable<ActivityLog, 'id'>
  profiles!: EntityTable<Profile, 'id'>
  user_preferences!: EntityTable<UserPreferences, 'user_id'>
  telegram_settings!: EntityTable<TelegramSettings, 'user_id'>
  outbox!: EntityTable<OutboxEntry, 'seq'>
  meta!: EntityTable<MetaEntry, 'key'>

  constructor() {
    super('consistency')
    this.version(1).stores({
      categories: 'id, updated_at, sort_order',
      time_blocks: 'id, updated_at, sort_order',
      reminders: 'id, updated_at, start_date, category_id, time_block_id',
      reminder_occurrences:
        'id, updated_at, occurrence_date, reminder_id, [reminder_id+occurrence_date]',
      completion_logs: 'id, updated_at, acted_at, reminder_id',
      daily_statistics: 'id, updated_at, date',
      activity_logs: 'id, updated_at, created_at',
      profiles: 'id',
      user_preferences: 'user_id',
      telegram_settings: 'user_id',
      outbox: '++seq, queued_at',
      meta: 'key',
    })
  }
}

export const db = new ConsistencyDB()

export async function getMeta(key: string): Promise<string | null> {
  const entry = await db.meta.get(key)
  return entry?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value })
}

/** Stable per-device id — used to skip realtime echoes of our own pushes. */
export async function getDeviceId(): Promise<string> {
  let id = await getMeta('device_id')
  if (!id) {
    id = crypto.randomUUID()
    await setMeta('device_id', id)
  }
  return id
}

/** Wipe every local table (sign-out / reset). */
export async function clearLocalData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear()
  })
}
