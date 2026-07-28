import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className
      )}
    >
      <div className="bg-primary/12 text-primary flex h-14 w-14 items-center justify-center rounded-full">
        <Icon className="h-6 w-6" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-extrabold">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-[260px] text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </motion.div>
  )
}
