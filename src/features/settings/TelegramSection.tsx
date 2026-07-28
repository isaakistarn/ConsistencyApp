/**
 * Telegram notification settings: bot credentials, per-kind toggles, digest
 * times, connection test with live status indicator.
 */
import { useState } from 'react'
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTelegramSettings } from '@/hooks/queries'
import { updateTelegramSettings } from '@/services/db/repositories/preferences'
import { testTelegramConnection } from '@/services/telegram'
import { DAY_LABELS } from '@/lib/constants'
import type { TelegramSettings } from '@/types'

export function TelegramSection() {
  const { data: settings } = useTelegramSettings()

  if (!settings) return null

  const patch = (p: Partial<TelegramSettings>) => void updateTelegramSettings(p)

  const status =
    settings.last_test_ok === true ? (
      <span className="flex items-center gap-1 text-emerald-500">
        <CheckCircle2 className="h-3.5 w-3.5" /> Connected
      </span>
    ) : settings.last_test_ok === false ? (
      <span className="text-destructive flex items-center gap-1">
        <XCircle className="h-3.5 w-3.5" /> Last test failed
      </span>
    ) : (
      <span className="text-muted-foreground">Not tested yet</span>
    )

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Telegram notifications</CardTitle>
          <span className="text-xs">{status}</span>
        </div>
        <CardDescription>
          Create a bot with{' '}
          <a
            className="text-primary underline underline-offset-2"
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
          >
            @BotFather
          </a>
          , message it once, then get your chat id from{' '}
          <a
            className="text-primary underline underline-offset-2"
            href="https://t.me/userinfobot"
            target="_blank"
            rel="noreferrer"
          >
            @userinfobot
          </a>
          . Scheduled sends run on the server — they arrive even when the app is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CredentialFields
          initialToken={settings.bot_token}
          initialChatId={settings.chat_id}
        />

        <div className="space-y-1 divide-y">
          <ToggleRow
            label="Enable notifications"
            description="Master switch for all Telegram messages"
            checked={settings.enabled}
            onChange={(v) => patch({ enabled: v })}
          />
          <ToggleRow
            label="Reminder alerts"
            description="When a reminder is due"
            checked={settings.notify_reminders}
            onChange={(v) => patch({ notify_reminders: v })}
            disabled={!settings.enabled}
          />
          <ToggleRow
            label="Missed reminders"
            description="30 minutes after a reminder stays pending"
            checked={settings.notify_missed}
            onChange={(v) => patch({ notify_missed: v })}
            disabled={!settings.enabled}
          />
          <ToggleRow
            label="Morning agenda"
            description="Your day at a glance"
            checked={settings.morning_agenda}
            onChange={(v) => patch({ morning_agenda: v })}
            disabled={!settings.enabled}
            trailing={
              settings.morning_agenda ? (
                <Input
                  type="time"
                  className="h-8 w-28"
                  aria-label="Morning agenda time"
                  value={settings.morning_agenda_time.slice(0, 5)}
                  onChange={(e) => patch({ morning_agenda_time: e.target.value })}
                />
              ) : undefined
            }
          />
          <ToggleRow
            label="Evening summary"
            description="Daily progress + streak"
            checked={settings.evening_summary}
            onChange={(v) => patch({ evening_summary: v })}
            disabled={!settings.enabled}
            trailing={
              settings.evening_summary ? (
                <Input
                  type="time"
                  className="h-8 w-28"
                  aria-label="Evening summary time"
                  value={settings.evening_summary_time.slice(0, 5)}
                  onChange={(e) => patch({ evening_summary_time: e.target.value })}
                />
              ) : undefined
            }
          />
          <ToggleRow
            label="Weekly progress"
            description="7-day recap at 18:00"
            checked={settings.weekly_progress}
            onChange={(v) => patch({ weekly_progress: v })}
            disabled={!settings.enabled}
            trailing={
              settings.weekly_progress ? (
                <Select
                  value={String(settings.weekly_progress_day)}
                  onValueChange={(v) => patch({ weekly_progress_day: Number(v) })}
                >
                  <SelectTrigger className="h-8 w-28" aria-label="Weekly progress day">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAY_LABELS.map((d, i) => (
                      <SelectItem key={d} value={String(i)}>
                        {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : undefined
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Mounted only after settings load, so local state initializes from real
 * values without needing a sync-from-props effect.
 */
function CredentialFields({
  initialToken,
  initialChatId,
}: {
  initialToken: string
  initialChatId: string
}) {
  const [botToken, setBotToken] = useState(initialToken)
  const [chatId, setChatId] = useState(initialChatId)
  const [testing, setTesting] = useState(false)

  const saveCredentials = async () => {
    await updateTelegramSettings({
      bot_token: botToken.trim(),
      chat_id: chatId.trim(),
    })
    toast.success('Telegram credentials saved')
  }

  const runTest = async () => {
    setTesting(true)
    try {
      await saveCredentials()
      const result = await testTelegramConnection()
      if (result.ok) {
        toast.success('Telegram connected', { description: 'Test message delivered.' })
      } else {
        toast.error('Telegram test failed', { description: result.detail })
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tg-token">Bot token</Label>
          <Input
            id="tg-token"
            type="password"
            autoComplete="off"
            placeholder="123456:ABC-DEF…"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tg-chat">Chat ID</Label>
          <Input
            id="tg-chat"
            autoComplete="off"
            placeholder="e.g. 123456789"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => void saveCredentials()}>
          Save
        </Button>
        <Button
          size="sm"
          onClick={() => void runTest()}
          disabled={testing || !botToken.trim() || !chatId.trim()}
        >
          {testing ? <Loader2 className="animate-spin" /> : <Send />}
          Test connection
        </Button>
      </div>
    </>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  trailing,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  trailing?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {trailing}
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-label={label}
        />
      </div>
    </div>
  )
}
