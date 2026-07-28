// telegram-send — authenticated endpoint the app calls to test the user's
// Telegram connection (or send an ad-hoc message). The caller must be a
// signed-in user; credentials are read from their own telegram_settings row,
// so no token ever travels from the browser to Telegram directly.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, esc, sendTelegramMessage } from '../_shared/telegram.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing authorization' }, 401)

  // A client scoped to the caller's JWT: RLS guarantees we can only read the
  // caller's own settings.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) return json({ error: 'Unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  const kind = typeof body.kind === 'string' ? body.kind : 'test'

  const { data: settings } = await supabase
    .from('telegram_settings')
    .select('bot_token, chat_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!settings?.bot_token || !settings?.chat_id) {
    return json({ ok: false, detail: 'Telegram is not configured yet.' }, 400)
  }

  const text =
    kind === 'test'
      ? '✅ <b>Consistency connected!</b>\nYour Telegram notifications are working.'
      : esc(String(body.text ?? '')).slice(0, 4000)

  if (!text) return json({ ok: false, detail: 'Empty message' }, 400)

  const result = await sendTelegramMessage(settings.bot_token, settings.chat_id, text)

  // Record the test outcome so the UI can show a status indicator.
  if (kind === 'test') {
    await supabase
      .from('telegram_settings')
      .update({ last_test_at: new Date().toISOString(), last_test_ok: result.ok })
      .eq('user_id', user.id)
  }

  return json(result, result.ok ? 200 : 502)
})

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
