import type { LucideIcon } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/** Fixed pastel tones (defined in styles/index.css) — stable across accents. */
export type StatTone = 'coral' | 'honey' | 'sage' | 'sky'

interface StatCardProps {
  icon: LucideIcon
  label: string
  value: string | number
  hint?: string
  tone?: StatTone
  /** Emphasize (e.g. an active streak) with a soft tinted card background */
  accent?: boolean
  index?: number
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'coral',
  accent,
  index = 0,
}: StatCardProps) {
  const reduceMotion = useReducedMotion()
  const toneVar = `var(--tone-${tone})`
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05, ease: 'easeOut' }}
    >
      <Card
        className={cn('h-full')}
        style={
          accent
            ? { background: `color-mix(in oklab, ${toneVar} 12%, var(--card))` }
            : undefined
        }
      >
        <CardContent className="flex items-start gap-3 p-4">
          <span
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: `color-mix(in oklab, ${toneVar} 18%, transparent)`,
              color: toneVar,
            }}
            aria-hidden
          >
            <Icon className="h-4.5 w-4.5" strokeWidth={2.5} />
          </span>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs font-bold">{label}</p>
            <p className="mt-1 text-2xl leading-none font-black tracking-tight tabular-nums">
              {value}
            </p>
            {hint ? (
              <p className="text-muted-foreground mt-1 text-[11px] font-semibold">
                {hint}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
