/**
 * A single reminder occurrence row: tap the ring to complete (with a spring
 * animation), overflow menu for snooze / skip / edit / duplicate / delete.
 * Used by the dashboard and the reminders list.
 */
import { memo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AlarmClock,
  Check,
  Copy,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SkipForward,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  completeWithUndo,
  deleteReminderWithToast,
  reopenOccurrence,
  skipWithUndo,
  snoozeWithToast,
} from '@/features/reminders/actions'
import { duplicateReminder } from '@/services/db/repositories/reminders'
import { useUiStore } from '@/store/ui'
import { describeRecurrence } from '@/lib/recurrence/presets'
import { formatClock, humanDate } from '@/lib/dates'
import { PRIORITIES, SNOOZE_OPTIONS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Category, ResolvedOccurrence, TimeFormat } from '@/types'

interface OccurrenceItemProps {
  occurrence: ResolvedOccurrence
  categories: Category[]
  timeFormat: TimeFormat
  /** Show the date (used in upcoming/overdue lists spanning days) */
  showDate?: boolean
}

export const OccurrenceItem = memo(function OccurrenceItem({
  occurrence,
  categories,
  timeFormat,
  showDate = false,
}: OccurrenceItemProps) {
  const reduceMotion = useReducedMotion()
  const setEditingReminderId = useUiStore((s) => s.setEditingReminderId)
  const { reminder, status, overdue } = occurrence
  const completed = status === 'completed'
  const skipped = status === 'skipped'
  const category = categories.find((c) => c.id === reminder.category_id)
  const color = reminder.color ?? category?.color ?? 'var(--primary)'
  const priority = PRIORITIES.find((p) => p.value === reminder.priority)

  const toggle = () =>
    completed
      ? void reopenOccurrence(reminder, occurrence.occurrence_date)
      : void completeWithUndo(reminder, occurrence.occurrence_date)

  return (
    <motion.div
      layout={reduceMotion ? false : 'position'}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={cn(
        'group bg-card dark:border-border/50 flex items-center gap-3 rounded-2xl border border-transparent px-3.5 py-3 shadow-[0_1px_8px_-2px_rgb(0_0_0/0.07)] transition-colors dark:shadow-none',
        (completed || skipped) && 'opacity-60'
      )}
    >
      {/* Complete toggle */}
      <button
        type="button"
        onClick={toggle}
        disabled={skipped}
        aria-label={completed ? `Reopen ${reminder.title}` : `Complete ${reminder.title}`}
        className={cn(
          'touch-target -m-2 flex items-center justify-center p-2',
          skipped && 'invisible'
        )}
      >
        <motion.span
          whileTap={reduceMotion ? undefined : { scale: 0.8 }}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors',
            completed ? 'border-transparent' : 'hover:brightness-110'
          )}
          style={{
            borderColor: completed ? undefined : color,
            background: completed ? color : 'transparent',
          }}
        >
          {completed ? (
            <Check className="text-background h-3.5 w-3.5" strokeWidth={3.5} />
          ) : null}
        </motion.span>
      </button>

      {/* Body */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={() => setEditingReminderId(reminder.id)}
        aria-label={`Edit ${reminder.title}`}
      >
        <p
          className={cn(
            'truncate text-sm font-medium',
            completed && 'text-muted-foreground line-through',
            skipped && 'text-muted-foreground line-through decoration-dotted'
          )}
        >
          {reminder.title}
        </p>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate text-xs">
          {showDate ? <span>{humanDate(occurrence.occurrence_date)}</span> : null}
          {occurrence.all_day ? (
            <span>All-day</span>
          ) : (
            <span className={cn(overdue && 'text-destructive font-medium')}>
              {formatClock(occurrence.scheduled_at, timeFormat)}
            </span>
          )}
          {occurrence.snoozed_until && status === 'pending' ? (
            <AlarmClock className="h-3 w-3" aria-label="Snoozed" />
          ) : null}
          {reminder.rrule ? <span>· {describeRecurrence(reminder.rrule)}</span> : null}
          {category ? <span className="truncate">· {category.name}</span> : null}
        </p>
      </button>

      {/* Trailing */}
      <div className="flex items-center gap-1.5">
        {overdue && !completed && !skipped ? (
          <Badge variant="destructive" className="hidden sm:inline-flex">
            Overdue
          </Badge>
        ) : null}
        {priority && priority.value !== 'none' ? (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: priority.color }}
            aria-label={`Priority: ${priority.label}`}
            role="img"
          />
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${reminder.title}`}
              className="text-muted-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="max-w-[180px] truncate">
              {reminder.title}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {completed ? (
              <DropdownMenuItem
                onClick={() =>
                  void reopenOccurrence(reminder, occurrence.occurrence_date)
                }
              >
                <RotateCcw /> Undo completion
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() =>
                    void completeWithUndo(reminder, occurrence.occurrence_date)
                  }
                >
                  <Check /> Complete
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <AlarmClock /> Snooze
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {SNOOZE_OPTIONS.map((o) => (
                      <DropdownMenuItem
                        key={o.minutes}
                        onClick={() =>
                          void snoozeWithToast(
                            reminder,
                            occurrence.occurrence_date,
                            o.minutes,
                            o.label
                          )
                        }
                      >
                        {o.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                {!skipped ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void skipWithUndo(reminder, occurrence.occurrence_date)
                    }
                  >
                    <SkipForward /> Skip
                  </DropdownMenuItem>
                ) : null}
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setEditingReminderId(reminder.id)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void duplicateReminder(reminder.id)}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void deleteReminderWithToast(reminder)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  )
})
