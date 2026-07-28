import type { Priority } from '@/types'

/** Accent presets — each maps to a runtime palette in styles/index.css */
export const ACCENT_COLORS = [
  { id: 'coral', label: 'Coral', hex: '#f2906b' },
  { id: 'emerald', label: 'Sage', hex: '#4fbf8b' },
  { id: 'blue', label: 'Sky', hex: '#60a5fa' },
  { id: 'violet', label: 'Violet', hex: '#a78bfa' },
  { id: 'rose', label: 'Rose', hex: '#fb7185' },
  { id: 'amber', label: 'Honey', hex: '#fbbf24' },
  { id: 'cyan', label: 'Cyan', hex: '#22d3ee' },
  { id: 'pink', label: 'Blossom', hex: '#f472b6' },
] as const

export const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: 'none', label: 'None', color: 'var(--muted-foreground)' },
  { value: 'low', label: 'Low', color: '#60a5fa' },
  { value: 'medium', label: 'Medium', color: '#fbbf24' },
  { value: 'high', label: 'High', color: '#fb923c' },
  { value: 'urgent', label: 'Urgent', color: '#f87171' },
]

export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
}

/** Category / time-block color swatches */
export const SWATCHES = [
  '#34d399',
  '#60a5fa',
  '#a78bfa',
  '#fb7185',
  '#fbbf24',
  '#22d3ee',
  '#fb923c',
  '#f472b6',
  '#4ade80',
  '#818cf8',
  '#f87171',
  '#64748b',
] as const

export const SNOOZE_OPTIONS = [
  { minutes: 10, label: '10 minutes' },
  { minutes: 30, label: '30 minutes' },
  { minutes: 60, label: '1 hour' },
  { minutes: 180, label: '3 hours' },
  { minutes: 24 * 60, label: 'Tomorrow' },
] as const

export const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const APP_NAME = 'Consistency'
