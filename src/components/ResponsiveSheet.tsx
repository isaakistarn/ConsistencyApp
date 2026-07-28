/**
 * The app's standard overlay surface: a bottom sheet (vaul) on phones — thumb
 * friendly, swipe to dismiss — and a centered dialog on desktop.
 */
import type { ReactNode } from 'react'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

interface ResponsiveSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Extra classes for the desktop dialog (e.g. max-w) */
  dialogClassName?: string
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  dialogClassName,
}: ResponsiveSheetProps) {
  const isDesktop = useIsDesktop()

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn('max-h-[85dvh] overflow-y-auto', dialogClassName)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          {children}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="pb-safe overflow-y-auto px-4 pb-6">{children}</div>
      </DrawerContent>
    </Drawer>
  )
}
