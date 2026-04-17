import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'

function toNumOrNull(v) {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function BookingEditPage() {
  const { id } = useParams()
  const bookingId = Number(id)
  const navigate = useNavigate()

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState(null)

  const [form, setForm] = useState({
    customer_name: '',
    phone: '',
    people: '',
    date: '',
    time: '',
    pickup: '',
    destination: '',
    flight_number: '',
  })

  const load = useCallback(async () => {
    if (!Number.isFinite(bookingId)) return
    setStatus('loading')
    setError(null)
    try {
      const res = await api.get(`/api/bookings/${bookingId}`)
      setData(res.data)
      setForm({
        customer_name: res.data?.customer_name ?? '',
        phone: res.data?.phone ?? '',
        people: String(res.data?.people ?? ''),
        date: res.data?.date ?? '',
        time: (res.data?.time ?? '').slice?.(0, 5) ?? res.data?.time ?? '',
        pickup: res.data?.pickup ?? '',
        destination: res.data?.destination ?? '',
        flight_number: res.data?.flight_number ?? '',
      })
      setStatus('ready')
    } catch (e) {
      setError(String(e?.response?.data?.detail ?? e?.message ?? 'Load failed'))
      setStatus('error')
    }
  }, [bookingId])

  useEffect(() => {
    void load()
  }, [load])

  const canSave = useMemo(() => {
    if (!form.customer_name.trim()) return false
    return true
  }, [form.customer_name])

  const save = useCallback(async () => {
    if (!Number.isFinite(bookingId)) return
    setSaving(true)
    setError(null)
    try {
      await api.patch(`/api/bookings/${bookingId}`, {
        customer_name: form.customer_name.trim() || null,
        phone: form.phone.trim() || null,
        people: toNumOrNull(form.people),
        date: form.date || null,
        time: form.time || null,
        pickup: form.pickup.trim() || null,
        destination: form.destination.trim() || null,
        flight_number: form.flight_number.trim() || null,
      })
      navigate(`/bookings/${bookingId}`, { replace: true })
    } catch (e) {
      setError(String(e?.response?.data?.detail ?? e?.message ?? 'Save failed'))
    } finally {
      setSaving(false)
    }
  }, [bookingId, form, navigate])

  if (!Number.isFinite(bookingId)) {
    return <div className="text-sm text-muted-foreground">Invalid booking id.</div>
  }

  if (status === 'error') {
    return (
      <div className="space-y-4">
        <div className="text-lg font-semibold text-red-300">Could not load booking</div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button onClick={load}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Edit booking #{bookingId}</div>
          <div className="text-sm text-muted-foreground">
            API: <span className="font-mono">PATCH /api/bookings/{bookingId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to={`/bookings/${bookingId}`}>Cancel</Link>
          </Button>
          <Button onClick={save} disabled={!canSave || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {status === 'loading' ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <div className="text-xs text-muted-foreground">Customer name</div>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.customer_name}
                  onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))}
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-muted-foreground">Phone</div>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-muted-foreground">Guests</div>
                <input
                  type="number"
                  min="1"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.people}
                  onChange={(e) => setForm((p) => ({ ...p, people: e.target.value }))}
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-muted-foreground">Flight number</div>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.flight_number}
                  onChange={(e) => setForm((p) => ({ ...p, flight_number: e.target.value }))}
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-muted-foreground">Date</div>
                <input
                  type="date"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.date}
                  onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                />
              </label>

              <label className="space-y-1">
                <div className="text-xs text-muted-foreground">Time</div>
                <input
                  type="time"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.time}
                  onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))}
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <div className="text-xs text-muted-foreground">Pickup</div>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.pickup}
                  onChange={(e) => setForm((p) => ({ ...p, pickup: e.target.value }))}
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <div className="text-xs text-muted-foreground">Destination</div>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.destination}
                  onChange={(e) => setForm((p) => ({ ...p, destination: e.target.value }))}
                />
              </label>
            </div>
          )}

          {data ? (
            <div className="pt-2">
              <div className="text-xs text-muted-foreground">Current status</div>
              <div className="text-sm font-medium">{String(data?.status ?? '—')}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

