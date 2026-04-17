import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'

export function BookingDetailPage() {
  const { id } = useParams()
  const bookingId = Number(id)

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  const load = useCallback(async () => {
    if (!Number.isFinite(bookingId)) return
    setStatus('loading')
    setError(null)
    try {
      const res = await api.get(`/api/bookings/${bookingId}`)
      setData(res.data)
      setStatus('ready')
    } catch (e) {
      setError(String(e?.response?.data?.detail ?? e?.message ?? 'Load failed'))
      setStatus('error')
    }
  }, [bookingId])

  useEffect(() => {
    void load()
  }, [load])

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
          <div className="text-2xl font-semibold tracking-tight">Booking #{bookingId}</div>
          <div className="text-sm text-muted-foreground">
            API: <span className="font-mono">GET /api/bookings/{bookingId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/bookings">Back</Link>
          </Button>
          <Button asChild>
            <Link to={`/bookings/${bookingId}/edit`}>Edit</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {status === 'loading' ? (
            <div className="text-muted-foreground">Loading…</div>
          ) : (
            <>
              <div>
                <span className="text-muted-foreground">Customer:</span>{' '}
                <span className="font-medium">{data?.customer_name ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Email:</span>{' '}
                <span className="font-medium">{data?.email ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Phone:</span>{' '}
                <span className="font-medium">{data?.phone ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Date:</span>{' '}
                <span className="font-medium">{data?.date ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Time:</span>{' '}
                <span className="font-medium">{data?.time ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Guests:</span>{' '}
                <span className="font-medium">{data?.people ?? data?.seats ?? '—'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span>{' '}
                <span className="font-medium">{String(data?.status ?? '—')}</span>
              </div>
              <div className="pt-3">
                <div className="text-xs text-muted-foreground">Raw</div>
                <pre className="mt-1 overflow-auto rounded-md border border-border bg-card p-3 text-xs">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

