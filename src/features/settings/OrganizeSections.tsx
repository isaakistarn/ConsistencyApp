/**
 * Categories + time blocks management (settings sections).
 */
import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ResponsiveSheet } from '@/components/ResponsiveSheet'
import {
  deleteCategory,
  deleteTimeBlock,
  saveCategory,
  saveTimeBlock,
} from '@/services/db/repositories/categories'
import { useCategories, useTimeBlocks } from '@/hooks/queries'
import { DAY_LABELS, SWATCHES } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Category, TimeBlock } from '@/types'

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export function CategoriesSection() {
  const { data: categories = [] } = useCategories()
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Group reminders by area of life</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
          <Plus /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No categories yet.
          </p>
        ) : (
          <ul className="divide-y">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {c.name}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${c.name}`}
                  onClick={() => setEditing(c)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${c.name}`}
                  className="text-destructive"
                  onClick={() => {
                    void deleteCategory(c.id)
                    toast(`Deleted “${c.name}”`)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New category' : 'Edit category'}
      >
        {editing !== null ? (
          <CategoryForm
            category={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </ResponsiveSheet>
    </Card>
  )
}

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? SWATCHES[0])

  const submit = async () => {
    if (!name.trim()) return
    await saveCategory({ id: category?.id, name: name.trim(), color, icon: 'tag' })
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cat-name">Name</Label>
        <Input
          id="cat-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Fitness"
          autoComplete="off"
        />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <Button className="w-full" onClick={() => void submit()} disabled={!name.trim()}>
        {category ? 'Save changes' : 'Create category'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Time blocks
// ---------------------------------------------------------------------------

export function TimeBlocksSection() {
  const { data: blocks = [] } = useTimeBlocks()
  const [editing, setEditing] = useState<TimeBlock | 'new' | null>(null)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Time blocks</CardTitle>
          <CardDescription>
            Recurring blocks like Gym or Study — shown on the calendar
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
          <Plus /> Add
        </Button>
      </CardHeader>
      <CardContent>
        {blocks.length === 0 ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No time blocks yet.
          </p>
        ) : (
          <ul className="divide-y">
            {blocks.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2.5">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: b.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {b.start_time.slice(0, 5)}–{b.end_time.slice(0, 5)} ·{' '}
                    {b.days_of_week
                      .slice()
                      .sort()
                      .map((d) => DAY_LABELS[d])
                      .join(', ')}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${b.name}`}
                  onClick={() => setEditing(b)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${b.name}`}
                  className="text-destructive"
                  onClick={() => {
                    void deleteTimeBlock(b.id)
                    toast(`Deleted “${b.name}”`)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ResponsiveSheet
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={editing === 'new' ? 'New time block' : 'Edit time block'}
      >
        {editing !== null ? (
          <TimeBlockForm
            block={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </ResponsiveSheet>
    </Card>
  )
}

function TimeBlockForm({ block, onDone }: { block?: TimeBlock; onDone: () => void }) {
  const [name, setName] = useState(block?.name ?? '')
  const [description, setDescription] = useState(block?.description ?? '')
  const [color, setColor] = useState(block?.color ?? SWATCHES[9])
  const [start, setStart] = useState(block?.start_time.slice(0, 5) ?? '09:00')
  const [end, setEnd] = useState(block?.end_time.slice(0, 5) ?? '10:00')
  const [days, setDays] = useState<number[]>(block?.days_of_week ?? [1, 2, 3, 4, 5])

  const valid = name.trim().length > 0 && days.length > 0 && start !== end

  const submit = async () => {
    if (!valid) return
    await saveTimeBlock({
      id: block?.id,
      name: name.trim(),
      description,
      color,
      start_time: start,
      end_time: end,
      days_of_week: [...days].sort(),
    })
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tb-name">Name</Label>
        <Input
          id="tb-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning Routine"
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="tb-start">Starts</Label>
          <Input
            id="tb-start"
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tb-end">Ends</Label>
          <Input
            id="tb-end"
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Days</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days of week">
          {DAY_LABELS.map((label, day) => {
            const active = days.includes(day)
            return (
              <button
                key={label}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setDays(active ? days.filter((d) => d !== day) : [...days, day])
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
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tb-desc">
          Description{' '}
          <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <Textarea
          id="tb-desc"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ColorPicker value={color} onChange={setColor} />
      <Button className="w-full" onClick={() => void submit()} disabled={!valid}>
        {block ? 'Save changes' : 'Create time block'}
      </Button>
    </div>
  )
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>Color</Label>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Color">
        {SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`Color ${hex}`}
            aria-pressed={value === hex}
            onClick={() => onChange(hex)}
            className={cn(
              'h-8 w-8 rounded-lg border transition-transform active:scale-90',
              value === hex && 'ring-ring ring-offset-background ring-2 ring-offset-2'
            )}
            style={{ background: hex }}
          />
        ))}
      </div>
    </div>
  )
}
