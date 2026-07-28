// Shared Telegram Bot API client for edge functions.
// Handles retries with exponential backoff and Telegram 429 rate limiting.

export interface SendResult {
  ok: boolean
  detail: string
}

const MAX_ATTEMPTS = 3

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string
): Promise<SendResult> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`
  let lastDetail = ''

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok && body.ok) return { ok: true, detail: 'sent' }

      // Rate limited: Telegram tells us how long to wait.
      if (res.status === 429) {
        const retryAfter = Number(body?.parameters?.retry_after ?? 2)
        lastDetail = `rate limited, retry_after=${retryAfter}s`
        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(retryAfter, 10) * 1000)
          continue
        }
        return { ok: false, detail: lastDetail }
      }

      // 4xx other than 429 will not succeed on retry (bad token / chat id).
      if (res.status >= 400 && res.status < 500) {
        return { ok: false, detail: body?.description ?? `HTTP ${res.status}` }
      }

      lastDetail = body?.description ?? `HTTP ${res.status}`
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err)
    }
    if (attempt < MAX_ATTEMPTS) await sleep(500 * 2 ** (attempt - 1))
  }
  return { ok: false, detail: lastDetail || 'failed after retries' }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Escape user content for Telegram HTML parse mode. */
export function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
