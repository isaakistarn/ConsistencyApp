/**
 * Settings: appearance (theme/accent), calendar defaults, categories, time
 * blocks, Telegram, data (export/import/reset) and account.
 */
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Download,
  Loader2,
  LogOut,
  Moon,
  Monitor,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/app/AuthProvider'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/misc'
import {
  CategoriesSection,
  TimeBlocksSection,
} from '@/features/settings/OrganizeSections'
import { TelegramSection } from '@/features/settings/TelegramSection'
import { usePreferences } from '@/hooks/queries'
import { updatePreferences } from '@/services/db/repositories/preferences'
import { clearLocalData } from '@/services/db/database'
import { deleteAccountData, signOut } from '@/services/supabase/auth'
import { downloadBackup, exportBackup, importBackup } from '@/services/backup'
import { useUiStore } from '@/store/ui'
import { ACCENT_COLORS, DAY_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { CalendarView, Theme } from '@/types'

export default function SettingsPage() {
  const { user, localOnly } = useAuth()
  const navigate = useNavigate()
  const { theme, accent, setTheme, setAccent } = useUiStore()
  const { data: preferences } = usePreferences()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  const patchPrefs = (p: Parameters<typeof updatePreferences>[0]) =>
    void updatePreferences(p)

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    setImporting(true)
    try {
      const result = await importBackup(file)
      toast.success('Backup restored', {
        description: `${result.imported} items imported, ${result.skipped} already up to date.`,
      })
    } catch (err) {
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-4">
      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Theme and accent color</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Theme</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label="Theme">
              {(
                [
                  { value: 'light', label: 'Light', icon: Sun },
                  { value: 'dark', label: 'Dark', icon: Moon },
                  { value: 'system', label: 'System', icon: Monitor },
                ] as { value: Theme; label: string; icon: typeof Sun }[]
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => {
                    setTheme(value)
                    patchPrefs({ theme: value })
                  }}
                  className={cn(
                    'flex h-16 flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors',
                    theme === value
                      ? 'border-primary bg-primary/5 text-foreground'
                      : 'text-muted-foreground hover:bg-accent'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Accent</Label>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Accent color">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={accent === c.id}
                  onClick={() => {
                    setAccent(c.id)
                    patchPrefs({ accent_color: c.id })
                  }}
                  className={cn(
                    'h-9 w-9 rounded-full border-2 border-transparent transition-transform active:scale-90',
                    accent === c.id &&
                      'ring-ring ring-offset-background ring-2 ring-offset-2'
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Calendar & format */}
      <Card>
        <CardHeader>
          <CardTitle>Calendar & format</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Week starts on</Label>
            <Select
              value={String(preferences?.week_starts_on ?? 1)}
              onValueChange={(v) => patchPrefs({ week_starts_on: Number(v) })}
            >
              <SelectTrigger aria-label="Week starts on">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 6, 0].map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {DAY_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Time format</Label>
            <Select
              value={preferences?.time_format ?? '24h'}
              onValueChange={(v) => patchPrefs({ time_format: v as '12h' | '24h' })}
            >
              <SelectTrigger aria-label="Time format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-hour</SelectItem>
                <SelectItem value="12h">12-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default calendar view</Label>
            <Select
              value={preferences?.default_calendar_view ?? 'timeGridWeek'}
              onValueChange={(v) =>
                patchPrefs({ default_calendar_view: v as CalendarView })
              }
            >
              <SelectTrigger aria-label="Default calendar view">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dayGridMonth">Month</SelectItem>
                <SelectItem value="timeGridWeek">Week</SelectItem>
                <SelectItem value="timeGridDay">Day</SelectItem>
                <SelectItem value="listWeek">Agenda</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Default duration</Label>
            <Select
              value={String(preferences?.default_duration_min ?? 30)}
              onValueChange={(v) => patchPrefs({ default_duration_min: Number(v) })}
            >
              <SelectTrigger aria-label="Default duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <CategoriesSection />
      <TimeBlocksSection />
      <TelegramSection />

      {/* Data */}
      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>Backup, restore and reset</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void exportBackup().then(downloadBackup)}
          >
            <Download /> Export backup
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
          >
            {importing ? <Loader2 className="animate-spin" /> : <Upload />}
            Import backup
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            aria-hidden
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive">
                <Trash2 /> Reset local data
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset this device?</AlertDialogTitle>
                <AlertDialogDescription>
                  Clears all locally stored data on this device. Synced data stays on the
                  server and will re-download on next sign-in. Unsynced changes will be
                  lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    void clearLocalData().then(() => window.location.reload())
                  }
                >
                  Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {localOnly
              ? 'Running in local-only mode — connect Supabase to sync across devices.'
              : (user?.email ?? '')}
          </CardDescription>
        </CardHeader>
        {!localOnly ? (
          <CardContent className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void signOut().then(() => navigate('/auth'))}
            >
              <LogOut /> Sign out
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 /> Delete all my data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete everything?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanently deletes all your reminders, statistics and settings from
                    the server and this device. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() =>
                      void deleteAccountData().then(() => {
                        toast('All data deleted')
                        window.location.reload()
                      })
                    }
                  >
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        ) : null}
      </Card>

      <p className="text-muted-foreground pb-4 text-center text-xs">
        Consistency v1.0 · local-first · your data syncs when you are online
      </p>
    </div>
  )
}
