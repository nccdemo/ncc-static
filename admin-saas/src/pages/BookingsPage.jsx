import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { api } from '../lib/api.js'
import { Button } from '../components/ui/button.jsx'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../components/ui/alert-dialog.jsx'

function mapBookings(data) {
  return (Array.isArray(data) ? data : []).map((b) => ({
    id: b.id,
    customer_name: b.customer_name || '—',
    email: b.email || '—',
    date: b.date || null,
    time: b.time || null,
    people: b.people ?? b.seats ?? null,
    status: String(b.status || '').toLowerCase() || '—',
    price: typeof b.price === 'number' ? b.price : null,
  }))
}

export function BookingsPage() {
  const { role } = useAuth()
  const title = role === 'admin' ? 'Bookings' : 'My Bookings'

  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const { data } = await api.get('/api/bookings')
      setRows(mapBookings(data))
      setStatus('ready')
    } catch (e) {
      setError(String(e?.response?.data?.detail ?? e?.message ?? 'Load failed'))
      setStatus('error')
    }
  }, [])

  const doDelete = useCallback(async () => {
    if (!deleteTarget) return
    setDeleteBusy(true)
    setNotice(null)
    try {
      await api.delete(`/api/admin/bookings/${deleteTarget.id}`)
      setNotice({ type: 'success', message: `Deleted booking #${deleteTarget.id}` })
      setDeleteTarget(null)
      await load()
    } catch (e) {
      // Helpful diagnostics for CORS / network errors
      console.error('DELETE ERROR:', e?.response?.data || e?.message || e)
      setNotice({
        type: 'error',
        message: String(e?.response?.data?.detail ?? e?.message ?? 'Delete failed'),
      })
    } finally {
      setDeleteBusy(false)
    }
  }, [deleteTarget, load])

  useEffect(() => {
    void load()
  }, [load])

  const total = useMemo(() => rows.length, [rows.length])

  if (status === 'error') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <div className="text-lg font-semibold text-red-300">Could not load bookings</div>
        <p className="text-sm text-muted-foreground text-center max-w-md">{error}</p>
        <Button onClick={load}>Retry</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight">{title}</div>
          <div className="text-sm text-muted-foreground">
            Dati reali da API: <span className="font-mono">GET /api/bookings</span>
            {' · '}
            {total} records
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={status === 'loading'}>
          {status === 'loading' ? 'Aggiorno…' : 'Aggiorna'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent bookings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notice ? (
            <div
              className={[
                'text-sm rounded-md border px-3 py-2',
                notice.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200',
              ].join(' ')}
            >
              {notice.message}
            </div>
          ) : null}
          {status === 'loading' ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No bookings found.</div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 text-left font-medium">ID</th>
                    <th className="py-2 text-left font-medium">Customer</th>
                    <th className="py-2 text-left font-medium">Email</th>
                    <th className="py-2 text-left font-medium">Date</th>
                    <th className="py-2 text-left font-medium">Time</th>
                    <th className="py-2 text-left font-medium">Guests</th>
                    <th className="py-2 text-left font-medium">Status</th>
                    <th className="py-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="py-2 font-mono">#{r.id}</td>
                      <td className="py-2">{r.customer_name}</td>
                      <td className="py-2">{r.email}</td>
                      <td className="py-2">{r.date || '—'}</td>
                      <td className="py-2">{r.time || '—'}</td>
                      <td className="py-2">{r.people ?? '—'}</td>
                      <td className="py-2">{r.status}</td>
                      <td className="py-2 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            className="text-xs font-semibold text-primary hover:underline"
                            to={`/bookings/${r.id}`}
                          >
                            View
                          </Link>
                          <Link
                            className="text-xs font-semibold text-primary hover:underline"
                            to={`/bookings/${r.id}/edit`}
                          >
                            Edit
                          </Link>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                type="button"
                                className="text-xs font-semibold text-destructive hover:underline"
                                onClick={() => setDeleteTarget(r)}
                              >
                                Delete
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete booking?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete booking <span className="font-mono">#{r.id}</span> and
                                  related records. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel disabled={deleteBusy}>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={doDelete} disabled={deleteBusy}>
                                  {deleteBusy ? 'Deleting…' : 'Delete'}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

