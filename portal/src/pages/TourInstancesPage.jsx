import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Input from '../components/Input.jsx'
import {
  createDriverInstance,
  getMyTour,
  listTourInstances,
} from '../api/driverTours.js'

function formatInstanceDate(iso) {
  if (!iso) return '—'
  const d = String(iso).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

function rowState(row) {
  const st = String(row.status || '').toLowerCase()
  if (st === 'cancelled') return 'Cancelled'
  const av = Number(row.available ?? 0)
  if (av <= 0) return 'Sold out'
  return 'Active'
}

export default function TourInstancesPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const tourId = Number(id)
  const [tourTitle, setTourTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [spots, setSpots] = useState('4')
  const [list, setList] = useState([])
  const [phase, setPhase] = useState('loading')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  async function reload() {
    const { data } = await listTourInstances(tourId)
    setList(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    if (!Number.isFinite(tourId)) {
      setPhase('error')
      setErr('Invalid tour')
      return
    }
    let cancelled = false
    ;(async () => {
      setPhase('loading')
      setErr('')
      try {
        const { data: t } = await getMyTour(tourId)
        if (cancelled) return
        setTourTitle(t?.title || `Tour #${tourId}`)
        await reload()
        if (cancelled) return
        setPhase('ok')
      } catch (e) {
        if (cancelled) return
        setErr(e?.response?.data?.detail || e?.message || 'Failed to load')
        setPhase('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tourId])

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    const n = Number(spots)
    if (!date || !Number.isFinite(n) || n < 1) {
      setErr('Date and available spots are required.')
      return
    }
    setSubmitting(true)
    try {
      await createDriverInstance({
        tour_id: tourId,
        date,
        time: time.trim() || undefined,
        available_seats: n,
      })
      setDate('')
      setTime('')
      await reload()
    } catch (e) {
      const d = e?.response?.data?.detail
      setErr(typeof d === 'string' ? d : e?.message || 'Could not create instance')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-[60vh] bg-neutral-50 px-4 py-6">
      <div className="mx-auto max-w-md">
        <button
          type="button"
          onClick={() => navigate(`/driver/tours/${tourId}`)}
          className="mb-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          Back to tour
        </button>
        <h1 className="text-xl font-bold text-neutral-900">Tour dates</h1>
        <p className="mt-1 text-sm text-neutral-600">{tourTitle}</p>

        <Card className="mt-6">
          <h2 className="mb-4 text-sm font-semibold text-neutral-900">New slot</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input label="Date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <Input
              label="Start time"
              name="time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
            <Input
              label="Available spots"
              name="spots"
              type="number"
              min={1}
              max={60}
              value={spots}
              onChange={(e) => setSpots(e.target.value)}
              required
            />
            {err ? <p className="text-sm text-red-600">{err}</p> : null}
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create date'}
            </Button>
          </form>
        </Card>

        <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Your dates
        </h2>
        {phase === 'loading' ? <p className="text-sm text-neutral-500">Loading…</p> : null}
        {phase === 'error' ? (
          <Card>
            <p className="text-sm text-red-600">{err}</p>
          </Card>
        ) : null}
        {phase === 'ok' && list.length === 0 ? (
          <p className="text-sm text-neutral-500">No dates yet.</p>
        ) : null}
        {phase === 'ok' && list.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {list.map((row) => (
              <li key={row.id}>
                <Card className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-neutral-900">{formatInstanceDate(row.date)}</p>
                    <p className="text-xs text-neutral-600">
                      Available {Number(row.available ?? 0)} / cap {Number(row.capacity ?? 0)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-neutral-700">{rowState(row)}</span>
                </Card>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
