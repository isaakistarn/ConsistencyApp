import { getSupabase, isSupabaseConfigured } from '@/services/supabase/client'
import { syncEngine } from '@/services/sync/engine'

export interface TelegramTestResult {
  ok: boolean
  detail: string
}

/**
 * Test the user's Telegram connection. Settings must be saved (and synced)
 * first — the edge function reads credentials from the user's own
 * telegram_settings row, so the bot token never travels from the browser to
 * Telegram directly.
 */
export async function testTelegramConnection(): Promise<TelegramTestResult> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      detail: 'Connect Supabase first — Telegram notifications are sent by the backend.',
    }
  }
  // Make sure the just-saved settings have reached the server.
  await syncEngine.syncNow()

  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('telegram-send', {
    body: { kind: 'test' },
  })
  if (error) {
    return { ok: false, detail: error.message ?? 'Edge function unavailable' }
  }
  return {
    ok: Boolean((data as TelegramTestResult)?.ok),
    detail: (data as TelegramTestResult)?.detail ?? 'Unknown response',
  }
}
