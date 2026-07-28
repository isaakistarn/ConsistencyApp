import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Theme } from '@/types'

interface UiState {
  /** Persisted (also read pre-paint by the inline script in index.html). */
  theme: Theme
  accent: string
  setTheme: (theme: Theme) => void
  setAccent: (accent: string) => void

  /** Ephemeral UI state */
  quickAddOpen: boolean
  setQuickAddOpen: (open: boolean) => void
  commandOpen: boolean
  setCommandOpen: (open: boolean) => void
  editingReminderId: string | null
  setEditingReminderId: (id: string | null) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      accent: 'coral',
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),

      quickAddOpen: false,
      setQuickAddOpen: (quickAddOpen) => set({ quickAddOpen }),
      commandOpen: false,
      setCommandOpen: (commandOpen) => set({ commandOpen }),
      editingReminderId: null,
      setEditingReminderId: (editingReminderId) => set({ editingReminderId }),
    }),
    {
      name: 'consistency:ui',
      partialize: (s) => ({ theme: s.theme, accent: s.accent }),
    }
  )
)

/** Apply theme + accent to the document root. */
export function applyAppearance(theme: Theme, accent: string): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.accent = accent
}
