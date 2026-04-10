import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import { api } from '../lib/api.js'
import { checkoutSessionErrorMessage } from '../lib/checkoutError.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'

export function PayPage() {
  const { id } = useParams()
  const bookingId = useMemo(() => (id ? String(id) : ''), [id])

  const [loading, setLoading] = useState(false)
  const [booking, setBooking] = useState(null)
  const [error, setError] = useState(null)

  async function load() {
    if (!bookingId) return
    setLoading(true)
    setError(null)
    try {
      const { data } = await api.get(`/api/bookings/${bookingId}`)
      setBooking(data)
    } catch (e) {
      setError(e?.response?.data?.detail ?? e?.message ?? 'Failed to load booking')
      setBooking(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId])

  async function onPay() {
    if (!booking) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.post('/api/payments/create-checkout-session', {
        booking_id: Number(bookingId),
      })
      const url = res?.data?.url ?? res?.data?.checkout_url
      if (!url) throw new Error('Missing payment URL')
      window.location.href = url
    } catch (e) {
      setError(checkoutSessionErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  const statusLower = String(booking?.status || '').toLowerCase()
  const isPending = statusLower === 'pending'

  async function onCancelBooking() {
    if (!booking || !isPending) return
    if (!window.confirm('Annullare questa prenotazione? I posti torneranno disponibili.')) return
    setLoading(true)
    setError(null)
    try {
      await api.delete(`/api/bookings/${bookingId}`)
      await load()
    } catch (e) {
      const d = e?.response?.data?.detail
      setError(typeof d === 'string' ? d : e?.message ?? 'Cancellazione non riuscita')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 py-6">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Payment</div>
        <div className="text-sm text-muted-foreground">Complete your ride payment securely.</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ride details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          {!booking && !error ? (
            <div className="text-sm text-muted-foreground">{loading ? 'Loading…' : '—'}</div>
          ) : null}

          {booking ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Stato</div>
                <div className="font-medium text-right capitalize">{booking.status ?? '—'}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Pickup</div>
                <div className="font-medium text-right">{booking.pickup ?? '—'}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Destination</div>
                <div className="font-medium text-right">{booking.destination ?? '—'}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">When</div>
                <div className="font-medium text-right">
                  {booking.date} {String(booking.time ?? '').slice(0, 5)}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Price</div>
                <div className="font-medium text-right">€ {Number(booking.price).toFixed(2)}</div>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              onClick={onPay}
              disabled={loading || !booking || !isPending}
            >
              {loading ? 'Redirecting…' : 'Paga con carta'}
            </Button>
            {booking && isPending ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive border-destructive/40 hover:bg-destructive/10"
                onClick={onCancelBooking}
                disabled={loading}
              >
                Cancella prenotazione
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

