import { useEffect, useMemo, useState } from 'react'

import { Button } from '../ui/button.jsx'
import { Input } from '../ui/input.jsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.jsx'

export function TourDialog({
  open,
  onOpenChange,
  mode, // 'create' | 'edit'
  initialTour,
  onSubmit,
  submitting = false,
}) {
  const title = mode === 'edit' ? 'Edit tour' : 'Create tour'
  const desc =
    mode === 'edit'
      ? 'Update tour details and save.'
      : 'Create a new tour in the catalog.'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('') // UI-only unless backend supports it

  const canSubmit = useMemo(() => {
    if (submitting) return false
    if (!name.trim()) return false
    const p = Number(price)
    if (!Number.isFinite(p) || p < 0) return false
    return true
  }, [name, price, submitting])

  useEffect(() => {
    if (!open) return
    setName(initialTour?.title ?? initialTour?.name ?? '')
    setDescription(initialTour?.description ?? '')
    setPrice(
      typeof initialTour?.price === 'number' ? String(initialTour.price) : '',
    )
    setDuration(initialTour?.duration ? String(initialTour.duration) : '')
  }, [open, initialTour])

  function handleSubmit(e) {
    e.preventDefault()
    const payload = {
      // Backend uses "title". We expose it as "name" in UI.
      title: name.trim(),
      description: description.trim() ? description.trim() : null,
      price: Number(price),
      // duration intentionally not sent unless your backend supports it.
    }
    onSubmit?.(payload)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Name</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Amalfi Coast Tour"
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Description</div>
            <textarea
              className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description..."
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">Price (€)</div>
              <Input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g. 99"
                disabled={submitting}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Duration</div>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 4h"
                disabled={submitting}
              />
              <div className="text-xs text-muted-foreground">
                Shown in UI. Needs backend support to persist.
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

