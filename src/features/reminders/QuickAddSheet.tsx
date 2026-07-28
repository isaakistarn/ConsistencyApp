/**
 * Quick add / edit sheet — opened from the tab bar “+”, the sidebar button,
 * calendar slot taps, and edit actions anywhere in the app (via
 * `editingReminderId` in the UI store).
 */
import { toast } from 'sonner'
import { useUiStore } from '@/store/ui'
import { useReminders } from '@/hooks/queries'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import { ReminderForm } from '@/features/reminders/ReminderForm'
import { deleteReminderWithToast } from '@/features/reminders/actions'

export function QuickAddSheet() {
  const { quickAddOpen, setQuickAddOpen, editingReminderId, setEditingReminderId } =
    useUiStore()
  const { data: reminders = [] } = useReminders()

  const editing = editingReminderId
    ? reminders.find((r) => r.id === editingReminderId)
    : undefined
  const open = quickAddOpen || Boolean(editingReminderId)

  const close = () => {
    setQuickAddOpen(false)
    setEditingReminderId(null)
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      title={editing ? 'Edit reminder' : 'New reminder'}
      dialogClassName="max-w-xl"
    >
      <ReminderForm
        key={editing?.id ?? 'new'}
        reminder={editing}
        onSaved={(saved) => {
          close()
          if (!editing) {
            toast.success(`“${saved.title}” created`)
          }
        }}
        onCancel={close}
        onDelete={
          editing
            ? () => {
                close()
                void deleteReminderWithToast(editing)
              }
            : undefined
        }
      />
    </ResponsiveSheet>
  )
}
