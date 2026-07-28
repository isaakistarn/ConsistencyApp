import { CloudOff, RefreshCw, Check, AlertTriangle } from 'lucide-react'
import { useSyncStore } from '@/store/sync'
import { isSupabaseConfigured } from '@/services/supabase/client'
import { syncEngine } from '@/services/sync/engine'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/misc'
import { cn } from '@/lib/utils'

/** Compact sync indicator shown in the header. Tap to force a sync. */
export function SyncStatusPill() {
  const { status, pendingCount, error } = useSyncStore()

  if (!isSupabaseConfigured) return null

  const config = {
    idle: { icon: Check, label: 'Synced', className: 'text-muted-foreground' },
    syncing: { icon: RefreshCw, label: 'Syncing…', className: 'text-primary' },
    offline: {
      icon: CloudOff,
      label: pendingCount > 0 ? `Offline · ${pendingCount} pending` : 'Offline',
      className: 'text-amber-500',
    },
    error: { icon: AlertTriangle, label: 'Sync issue', className: 'text-destructive' },
  }[status]

  const Icon = config.icon

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => void syncEngine.syncNow()}
          aria-label={`Sync status: ${config.label}. Tap to sync now.`}
          className={cn(
            'hover:bg-accent flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium transition-colors',
            config.className
          )}
        >
          <Icon className={cn('h-3.5 w-3.5', status === 'syncing' && 'animate-spin')} />
          <span className="hidden sm:inline">{config.label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {error ? `${config.label} — ${error}` : `${config.label}. Tap to sync now.`}
      </TooltipContent>
    </Tooltip>
  )
}
