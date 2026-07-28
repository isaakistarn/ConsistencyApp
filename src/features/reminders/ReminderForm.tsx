/**
 * Full reminder create/edit form. Zod-validated, mobile-first. Handles
 * schedule, recurrence presets (incl. every-X and custom RRULE), category,
 * time block, priority, color, duration and notification lead time.
 */
import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategories, usePreferences, useTimeBlocks } from '@/hooks/queries'
import {
  createReminder,
  updateReminder,
  type ReminderDraft,
} from '@/services/db/repositories/reminders'
import { buildRRule, parseToConfig, type RecurrenceKind } from '@/lib/recurrence/presets'
import { deviceTimeZone, todayIso } from '@/lib/dates'
import { DAY_LABELS, PRIORITIES, SWATCHES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Priority, Reminder } from '@/types'

const formSchema = z
  .object({
    title: z.string().trim().min(1, 'Give it a name').max(200),
    description: z.string().max(2000).default(''),
    priority: z.enum(['none', 'low', 'medium', 'high', 'urgent']),
    category_id: z.string().nullable(),
    time_block_id: z.string().nullable(),
    color: z.string().nullable(),
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
    end_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    all_day: z.boolean(),
    reminder_time: z.string().nullable(),
    duration_minutes: z.coerce.number().int().min(0).max(1440),
    recurrenceKind: z.enum([
      'once',
      'daily',
      'weekdays',
      'weekly',
      'monthly',
      'yearly',
      'every_x_days',
      'every_x_weeks',
      'custom',
    ]),
    interval: z.coerce.number().int().min(1).max(365),
    byWeekday: z.array(z.number().int().min(0).max(6)),
    customRule: z.string().default(''),
    notify: z.boolean(),
    notify_minutes_before: z.coerce.number().int().min(0).max(10080),
    notes: z.string().max(5000).default(''),
  })
  .refine((v) => v.all_day || Boolean(v.reminder_time), {
    path: ['reminder_time'],
    message: 'Pick a time (or make it all-day)',
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, {
    path: ['end_date'],
    message: 'Ends before it starts',
  })
  .refine(
    (v) => {
      if (v.recurrenceKind !== 'custom') return true
      try {
        return buildRRule({ kind: 'custom', customRule: v.customRule }) !== null
      } catch {
        return false
      }
    },
    { path: ['customRule'], message: 'Not a valid RRULE' }
  )

type FormValues = z.infer<typeof formSchema>

const RECURRENCE_OPTIONS: { value: RecurrenceKind; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'every_x_days', label: 'Every X days' },
  { value: 'every_x_weeks', label: 'Every X weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom (RRULE)' },
]

interface ReminderFormProps {
  reminder?: Reminder
  /** Prefill for quick add (e.g. tapped calendar slot) */
  defaults?: Partial<Pick<Reminder, 'start_date' | 'reminder_time' | 'time_block_id'>>
  onSaved: (reminder: Reminder) => void
  onCancel?: () => void
  /** Shown when editing: deletes the whole reminder (confirmed first). */
  onDelete?: () => void
}

export function ReminderForm({
  reminder,
  defaults,
  onSaved,
  onCancel,
  onDelete,
}: ReminderFormProps) {
  const { data: categories = [] } = useCategories()
  const { data: timeBlocks = [] } = useTimeBlocks()
  const { data: preferences } = usePreferences()
  const [submitting, setSubmitting] = useState(false)

  const initial = useMemo<FormValues>(() => {
    const recurrence = parseToConfig(reminder?.rrule ?? null)
    return {
      title: reminder?.title ?? '',
      description: reminder?.description ?? '',
      priority: reminder?.priority ?? 'none',
      category_id: reminder?.category_id ?? null,
      time_block_id: reminder?.time_block_id ?? defaults?.time_block_id ?? null,
      color: reminder?.color ?? null,
      start_date: reminder?.start_date ?? defaults?.start_date ?? todayIso(),
      end_date: reminder?.end_date ?? null,
      all_day: reminder?.all_day ?? false,
      reminder_time:
        reminder?.reminder_time?.slice(0, 5) ??
        defaults?.reminder_time?.slice(0, 5) ??
        '09:00',
      duration_minutes:
        reminder?.duration_minutes ?? preferences?.default_duration_min ?? 30,
      recurrenceKind: recurrence.kind,
      interval: recurrence.interval ?? 2,
      byWeekday: recurrence.byWeekday ?? [],
      customRule: recurrence.customRule ?? '',
      notify: reminder?.notify ?? true,
      notify_minutes_before: reminder?.notify_minutes_before ?? 0,
      notes: reminder?.notes ?? '',
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminder?.id, defaults?.start_date, defaults?.reminder_time])

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema) as never,
    defaultValues: initial,
  })

  useEffect(() => reset(initial), [initial, reset])

  const allDay = watch('all_day')
  const recurrenceKind = watch('recurrenceKind')
  const notify = watch('notify')
  const showWeekdays = recurrenceKind === 'weekly' || recurrenceKind === 'every_x_weeks'
  const showInterval =
    recurrenceKind === 'every_x_days' || recurrenceKind === 'every_x_weeks'

  const onSubmit = handleSubmit(async (values) => {
    setSubmitting(true)
    try {
      const rrule = buildRRule({
        kind: values.recurrenceKind,
        interval: values.interval,
        byWeekday: values.byWeekday,
        customRule: values.customRule,
      })
      const draft: ReminderDraft = {
        title: values.title,
        description: values.description,
        priority: values.priority as Priority,
        category_id: values.category_id,
        time_block_id: values.time_block_id,
        color: values.color,
        rrule,
        timezone: reminder?.timezone ?? deviceTimeZone(),
        start_date: values.start_date,
        end_date: values.recurrenceKind === 'once' ? null : values.end_date,
        reminder_time: values.all_day ? null : values.reminder_time,
        duration_minutes: values.duration_minutes,
        all_day: values.all_day,
        notify: values.notify,
        notify_minutes_before: values.notify_minutes_before,
        notes: values.notes,
      }
      const saved = reminder
        ? await updateReminder(reminder.id, draft)
        : await createReminder(draft)
      if (saved) onSaved(saved)
    } catch (err) {
      toast.error('Could not save reminder', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSubmitting(false)
    }
  })

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {/* Title + description */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rf-title">Title</Label>
          <Input
            id="rf-title"
            placeholder="e.g. Morning run"
            autoComplete="off"
            {...register('title')}
          />
          {errors.title ? (
            <p className="text-destructive text-xs">{errors.title.message}</p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rf-desc">
            Description{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="rf-desc"
            rows={2}
            placeholder="Details…"
            {...register('description')}
          />
        </div>
      </div>

      {/* Schedule */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-extrabold tracking-tight">
          Schedule
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rf-date">Start date</Label>
            <Input id="rf-date" type="date" {...register('start_date')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-time">Time</Label>
            <Input
              id="rf-time"
              type="time"
              disabled={allDay}
              {...register('reminder_time')}
            />
            {errors.reminder_time ? (
              <p className="text-destructive text-xs">{errors.reminder_time.message}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <Label htmlFor="rf-allday" className="cursor-pointer">
            All-day
          </Label>
          <Controller
            control={control}
            name="all_day"
            render={({ field }) => (
              <Switch
                id="rf-allday"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rf-duration">Duration (min)</Label>
            <Input
              id="rf-duration"
              type="number"
              min={0}
              max={1440}
              step={5}
              disabled={allDay}
              {...register('duration_minutes')}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Repeat</Label>
            <Controller
              control={control}
              name="recurrenceKind"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Repeat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {showInterval ? (
          <div className="space-y-1.5">
            <Label htmlFor="rf-interval">
              Every how many {recurrenceKind === 'every_x_days' ? 'days' : 'weeks'}?
            </Label>
            <Input
              id="rf-interval"
              type="number"
              min={1}
              max={365}
              {...register('interval')}
            />
          </div>
        ) : null}

        {showWeekdays ? (
          <Controller
            control={control}
            name="byWeekday"
            render={({ field }) => (
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Repeat on days"
              >
                {DAY_LABELS.map((label, day) => {
                  const active = field.value.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        field.onChange(
                          active
                            ? field.value.filter((d) => d !== day)
                            : [...field.value, day].sort()
                        )
                      }
                      className={cn(
                        'h-9 w-11 rounded-lg border text-xs font-medium transition-colors',
                        active
                          ? 'bg-primary text-primary-foreground border-transparent'
                          : 'text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            )}
          />
        ) : null}

        {recurrenceKind === 'custom' ? (
          <div className="space-y-1.5">
            <Label htmlFor="rf-rrule">RRULE</Label>
            <Input
              id="rf-rrule"
              placeholder="FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH"
              className="font-mono text-xs"
              {...register('customRule')}
            />
            {errors.customRule ? (
              <p className="text-destructive text-xs">{errors.customRule.message}</p>
            ) : null}
          </div>
        ) : null}

        {recurrenceKind !== 'once' ? (
          <div className="space-y-1.5">
            <Label htmlFor="rf-end">
              Ends <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Controller
              control={control}
              name="end_date"
              render={({ field }) => (
                <Input
                  id="rf-end"
                  type="date"
                  value={field.value ?? ''}
                  onChange={(e) => field.onChange(e.target.value || null)}
                />
              )}
            />
            {errors.end_date ? (
              <p className="text-destructive text-xs">{errors.end_date.message}</p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {/* Organisation */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-extrabold tracking-tight">
          Organise
        </legend>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Controller
              control={control}
              name="priority"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-label="Priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: p.color }}
                          />
                          {p.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                >
                  <SelectTrigger aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: c.color }}
                          />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {timeBlocks.length > 0 ? (
          <div className="space-y-1.5">
            <Label>Time block</Label>
            <Controller
              control={control}
              name="time_block_id"
              render={({ field }) => (
                <Select
                  value={field.value ?? 'none'}
                  onValueChange={(v) => field.onChange(v === 'none' ? null : v)}
                >
                  <SelectTrigger aria-label="Time block">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No time block</SelectItem>
                    {timeBlocks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: b.color }}
                          />
                          {b.name} · {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        ) : null}

        <Controller
          control={control}
          name="color"
          render={({ field }) => (
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Color">
                <button
                  type="button"
                  onClick={() => field.onChange(null)}
                  aria-label="Use category color"
                  aria-pressed={field.value === null}
                  className={cn(
                    'text-muted-foreground h-8 rounded-lg border px-2 text-[11px] font-medium',
                    field.value === null && 'ring-ring ring-2'
                  )}
                >
                  Auto
                </button>
                {SWATCHES.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    aria-label={`Color ${hex}`}
                    aria-pressed={field.value === hex}
                    onClick={() => field.onChange(hex)}
                    className={cn(
                      'h-8 w-8 rounded-lg border transition-transform active:scale-90',
                      field.value === hex &&
                        'ring-ring ring-offset-background ring-2 ring-offset-2'
                    )}
                    style={{ background: hex }}
                  />
                ))}
              </div>
            </div>
          )}
        />
      </fieldset>

      {/* Notifications */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-extrabold tracking-tight">
          Notifications
        </legend>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5">
          <Label htmlFor="rf-notify" className="cursor-pointer">
            Telegram notification
          </Label>
          <Controller
            control={control}
            name="notify"
            render={({ field }) => (
              <Switch
                id="rf-notify"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>
        {notify && !allDay ? (
          <div className="space-y-1.5">
            <Label>Remind me</Label>
            <Controller
              control={control}
              name="notify_minutes_before"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(Number(v))}
                >
                  <SelectTrigger aria-label="Notification lead time">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">At the scheduled time</SelectItem>
                    <SelectItem value="5">5 minutes before</SelectItem>
                    <SelectItem value="10">10 minutes before</SelectItem>
                    <SelectItem value="15">15 minutes before</SelectItem>
                    <SelectItem value="30">30 minutes before</SelectItem>
                    <SelectItem value="60">1 hour before</SelectItem>
                    <SelectItem value="1440">1 day before</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        ) : null}
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="rf-notes">
          Notes <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea id="rf-notes" rows={2} {...register('notes')} />
      </div>

      <div className="flex gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {reminder ? 'Save changes' : 'Create reminder'}
        </Button>
      </div>

      {reminder && onDelete ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive w-full"
            >
              <Trash2 /> Delete reminder
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{reminder.title}”?</AlertDialogTitle>
              <AlertDialogDescription>
                {reminder.rrule
                  ? 'This removes the reminder and all of its occurrences, including its history.'
                  : 'This removes the reminder.'}{' '}
                You can’t undo this.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={onDelete}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </form>
  )
}
