/**
 * User-facing occurrence actions: repository calls wrapped with toasts and
 * one-tap undo. Every destructive/completing action is reversible.
 */
import { toast } from 'sonner'
import {
  completeOccurrence,
  skipOccurrence,
  snoozeOccurrence,
  undoCompletion,
  unskipOccurrence,
} from '@/services/db/repositories/occurrences'
import { deleteReminder } from '@/services/db/repositories/reminders'
import type { Reminder } from '@/types'

export async function completeWithUndo(
  reminder: Reminder,
  occurrenceDate: string
): Promise<void> {
  await completeOccurrence(reminder, occurrenceDate)
  toast.success(`Completed “${reminder.title}”`, {
    action: {
      label: 'Undo',
      onClick: () => void undoCompletion(reminder, occurrenceDate),
    },
  })
}

export async function reopenOccurrence(
  reminder: Reminder,
  occurrenceDate: string
): Promise<void> {
  await undoCompletion(reminder, occurrenceDate)
  toast(`Reopened “${reminder.title}”`)
}

export async function skipWithUndo(
  reminder: Reminder,
  occurrenceDate: string
): Promise<void> {
  await skipOccurrence(reminder, occurrenceDate)
  toast(`Skipped “${reminder.title}”`, {
    description: 'Skipped items don’t count against your streak.',
    action: {
      label: 'Undo',
      onClick: () => void unskipOccurrence(reminder, occurrenceDate),
    },
  })
}

export async function snoozeWithToast(
  reminder: Reminder,
  occurrenceDate: string,
  minutes: number,
  label: string
): Promise<void> {
  await snoozeOccurrence(reminder, occurrenceDate, minutes)
  toast(`Snoozed “${reminder.title}”`, { description: `Reminding again in ${label}.` })
}

export async function deleteReminderWithToast(reminder: Reminder): Promise<void> {
  await deleteReminder(reminder.id)
  toast(`Deleted “${reminder.title}”`)
}
