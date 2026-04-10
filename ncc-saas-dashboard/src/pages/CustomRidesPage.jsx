import { useEffect, useMemo, useState } from 'react'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.jsx'
import { Input } from '../components/ui/input.jsx'
import { CustomRidesTable } from '../components/custom-rides/CustomRidesTable.jsx'

const emptyForm = {
  pickup: '',
  destination: '',
  date: '',
  time: '',
  price: '',
  email: '',
}

export function CustomRidesPage() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [createdQuote, setCreatedQuote] = useState(null)
  const [rides, setRides] = useState([])

  const quoteUrl = useMemo(() => {
    if (!createdQuote?.quote_id) return null
    return `${window.location.origin}/quote/${createdQuote.quote_id}`
  }, [createdQuote])

  const fetchRides = async () => {
    try {
      const { data } = await api.get('/api/rides')
      const next = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : []
      setRides(next)
    } catch (e) {
      console.error('Failed to fetch rides', e)
      setRides([])
    }
  }

  const handleRefund = async (rideId) => {
    await api.post(`/api/rides/${rideId}/refund`)
    fetchRides()
  }

  const markCashPaid = async (rideId) => {
    await api.post(`/api/rides/${rideId}/cash`)
    fetchRides()
  }

  function open() {
    setForm(emptyForm)
    setError('')
    setCreatedQuote(null)
    setDialogOpen(true)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.pickup.trim() || !form.destination.trim() || !form.date || !form.time) return
    const price = Number(form.price)
    if (!Number.isFinite(price) || price <= 0) return
    if (!form.email.trim()) return

    setSubmitting(true)
    setError('')
    try {
      const payload = {
        pickup: form.pickup.trim(),
        destination: form.destination.trim(),
        date: form.date,
        time: form.time,
        price,
        email: form.email.trim(),
      }
      console.log('PAYLOAD:', payload)
      const { data } = await api.post('/api/bookings/custom-ride', payload)
      console.log('CREATED:', data)
      setCreatedQuote(data)
      fetchRides()
    } catch (err) {
      console.error('Failed to create custom ride', err)
      setError(err?.response?.data?.detail ?? err?.message ?? 'Could not create custom ride')
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    fetchRides()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Custom Rides</div>
          <div className="text-sm text-muted-foreground">
            Create a one-off ride and send a quote link to the customer.
          </div>
        </div>
        <Button type="button" onClick={open}>
          Create Custom Ride
        </Button>
      </div>

      {createdQuote?.quote_id ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            background: '#111',
            borderRadius: 8,
            color: 'white',
          }}
        >
          <p>Preventivo #{createdQuote.quote_id} creato</p>
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/quote/${createdQuote.quote_id}`
              navigator.clipboard.writeText(url)
            }}
          >
            Copy Link
          </button>
        </div>
      ) : null}

      {createdQuote?.quote_id ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Creato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              Preventivo #{createdQuote.quote_id} — il trip si crea solo dopo il pagamento.
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  if (!quoteUrl) return
                  try {
                    await navigator.clipboard.writeText(quoteUrl)
                  } catch {
                    window.prompt('Copy link', quoteUrl)
                    return
                  }
                }}
              >
                Copy Link
              </Button>
              {quoteUrl ? (
                <a className="text-sm text-muted-foreground underline" href={quoteUrl} target="_blank" rel="noreferrer">
                  Open /quote
                </a>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">How it works</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Create a ride draft, copy the <span className="font-mono">/quote/:id</span> link, and share it with the client.
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom rides</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomRidesTable rows={rides} handleRefund={handleRefund} markCashPaid={markCashPaid} />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create custom ride</DialogTitle>
            <DialogDescription>Crea un preventivo (POST /api/bookings/custom-ride) — trip solo dopo pagamento.</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error ? <div className="text-sm text-red-600">{error}</div> : null}

            <div className="space-y-2">
              <div className="text-sm font-medium">Pickup</div>
              <Input
                value={form.pickup}
                onChange={(e) => setForm((f) => ({ ...f, pickup: e.target.value }))}
                required
                disabled={submitting}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium">Destination</div>
              <Input
                value={form.destination}
                onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                required
                disabled={submitting}
                autoComplete="off"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Date</div>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Time</div>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                  required
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium">Price (EUR)</div>
                <Input
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  required
                  disabled={submitting}
                />
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium">Client email</div>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                  disabled={submitting}
                  autoComplete="email"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={submitting} onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

